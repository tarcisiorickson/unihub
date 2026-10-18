#!/usr/bin/env python3
"""
Upscale com IA (Real-ESRGAN realesr-general-x4v3) para levar vídeos de celular/WhatsApp
a 4K (2160x3840), rodando só em CPU com ONNX Runtime — sem PyTorch.

    python3 scripts/upscale-video.py reels/media/clipe.mp4 --out reels/media/clipe-4k.mp4
    python3 scripts/upscale-video.py longo.mp4 --start 17.5 --duration 1.6 --out trecho-4k.mp4

O modelo reconstrói detalhes e remove blocos de compressão (não é só esticar a imagem).
Depois: ampliação lanczos até cobrir 2160x3840, nitidez adaptativa (CAS) leve e H.264 de alta taxa.
Dependências: pip install onnx onnxruntime numpy  ·  ffmpeg no PATH.
Os pesos são baixados do GitHub do Real-ESRGAN na primeira execução (pasta ~/.cache/unihub-sr).
"""
import argparse
import io
import json
import os
import pickle
import subprocess
import sys
import time
import urllib.request
import zipfile
from collections import OrderedDict

import numpy as np

CACHE = os.path.expanduser('~/.cache/unihub-sr')
WEIGHTS = {
    'x4v3': 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth',
    'wdn': 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-wdn-x4v3.pth',
}


# ---------- leitura segura do .pth (zip do PyTorch) sem importar torch ----------
class _Storage:
    def __init__(self, dtype):
        self.dtype = dtype


class _SafeUnpickler(pickle.Unpickler):
    """Só aceita as classes necessárias para reconstruir tensores — nunca executa código arbitrário."""

    def __init__(self, f, zf, prefix):
        super().__init__(f)
        self.zf, self.prefix = zf, prefix

    def find_class(self, module, name):
        if module == 'collections' and name == 'OrderedDict':
            return OrderedDict
        if module == 'torch._utils' and name == '_rebuild_tensor_v2':
            return _rebuild_tensor
        if module == 'torch' and name in ('FloatStorage', 'HalfStorage'):
            return _Storage(np.float32 if name == 'FloatStorage' else np.float16)
        raise pickle.UnpicklingError(f'classe não permitida no modelo: {module}.{name}')

    def persistent_load(self, pid):
        _, storage_type, key, _location, _numel = pid
        raw = self.zf.read(f'{self.prefix}/data/{key}')
        return np.frombuffer(raw, dtype=storage_type.dtype)


def _rebuild_tensor(storage, offset, size, stride, *_):
    if not size:
        return storage[offset:offset + 1].reshape(())
    arr = np.lib.stride_tricks.as_strided(storage[offset:], shape=size, strides=[s * storage.itemsize for s in stride])
    return np.array(arr, dtype=np.float32)


def load_pth(path):
    with zipfile.ZipFile(path) as zf:
        pkl = next(n for n in zf.namelist() if n.endswith('data.pkl'))
        prefix = pkl.rsplit('/', 1)[0]
        obj = _SafeUnpickler(io.BytesIO(zf.read(pkl)), zf, prefix).load()
    return obj.get('params_ema') or obj.get('params') or obj


# ---------- modelo SRVGGNetCompact em ONNX ----------
def build_onnx(denoise, path):
    import onnx
    from onnx import TensorProto, helper, numpy_helper

    os.makedirs(CACHE, exist_ok=True)
    sd = {}
    for k, url in WEIGHTS.items():
        f = os.path.join(CACHE, os.path.basename(url))
        if not os.path.exists(f):
            print(f'baixando pesos {os.path.basename(url)}…', file=sys.stderr)
            urllib.request.urlretrieve(url, f)
        sd[k] = load_pth(f)
    # mistura dos dois modelos (como no Real-ESRGAN): denoise 1 = limpa mais, 0 = preserva textura
    w = {k: denoise * sd['x4v3'][k] + (1 - denoise) * sd['wdn'][k] for k in sd['x4v3']}

    nodes, inits = [], []
    def init(name, arr):
        inits.append(numpy_helper.from_array(arr.astype(np.float32), name))
    cur, idx = 'input', 0
    convs = sorted({int(k.split('.')[1]) for k in w if k.endswith('.bias')})
    for i in range(convs[-1] + 1):
        if f'body.{i}.bias' in w:
            init(f'w{i}', w[f'body.{i}.weight']); init(f'b{i}', w[f'body.{i}.bias'])
            nodes.append(helper.make_node('Conv', [cur, f'w{i}', f'b{i}'], [f'c{i}'], pads=[1, 1, 1, 1], kernel_shape=[3, 3]))
            cur = f'c{i}'
        elif f'body.{i}.weight' in w:
            init(f'a{i}', w[f'body.{i}.weight'].reshape(-1, 1, 1))
            nodes.append(helper.make_node('PRelu', [cur, f'a{i}'], [f'p{i}']))
            cur = f'p{i}'
    nodes.append(helper.make_node('DepthToSpace', [cur], ['up'], blocksize=4, mode='CRD'))
    init('scales', np.array([1, 1, 4, 4], dtype=np.float32))
    nodes.append(helper.make_node('Resize', ['input', '', 'scales'], ['base'], mode='nearest'))
    nodes.append(helper.make_node('Add', ['up', 'base'], ['output']))
    graph = helper.make_graph(nodes, 'srvgg', [helper.make_tensor_value_info('input', TensorProto.FLOAT, [1, 3, None, None])],
                              [helper.make_tensor_value_info('output', TensorProto.FLOAT, [1, 3, None, None])], inits)
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid('', 17)])
    model.ir_version = 8  # compatível com versões mais antigas do ONNX Runtime
    onnx.save(model, path)


def probe(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:stream_side_data=rotation',
                          '-of', 'json', path], capture_output=True, text=True, check=True).stdout
    s = json.loads(out)['streams'][0]
    w, h = s['width'], s['height']
    rot = next((abs(int(d.get('rotation', 0))) for d in s.get('side_data_list', []) if 'rotation' in d), 0)
    return (h, w) if rot in (90, 270) else (w, h)


def has_audio(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', path],
                         capture_output=True, text=True).stdout.strip()
    return bool(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input')
    ap.add_argument('--out', required=True)
    ap.add_argument('--start', type=float, default=0)
    ap.add_argument('--duration', type=float, default=None)
    ap.add_argument('--width', type=int, default=2160)
    ap.add_argument('--height', type=int, default=3840)
    ap.add_argument('--denoise', type=float, default=0.6, help='0 = preserva textura, 1 = limpa mais a compressão')
    ap.add_argument('--fps', type=float, default=30)
    ap.add_argument('--threads', type=int, default=os.cpu_count())
    args = ap.parse_args()

    import onnxruntime as ort
    model = os.path.join(CACHE, f'realesr-general-x4v3-dn{args.denoise:.2f}.onnx')
    if not os.path.exists(model):
        build_onnx(args.denoise, model)
    so = ort.SessionOptions()
    so.intra_op_num_threads = args.threads
    sess = ort.InferenceSession(model, so, providers=['CPUExecutionProvider'])

    w, h = probe(args.input)
    seek = ['-ss', str(args.start)] + (['-t', str(args.duration)] if args.duration else [])
    dec = subprocess.Popen(['ffmpeg', '-loglevel', 'error'] + seek + ['-i', args.input, '-vf', f'fps={args.fps}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                           stdout=subprocess.PIPE)
    ow, oh = w * 4, h * 4
    vf = (f'scale={args.width}:{args.height}:force_original_aspect_ratio=increase:flags=lanczos,'
          f'crop={args.width}:{args.height},cas=0.35,format=yuv420p')
    enc_cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{ow}x{oh}', '-r', str(args.fps), '-i', '-']
    audio = has_audio(args.input)
    if audio:
        enc_cmd += seek + ['-i', args.input, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '256k']
    enc_cmd += ['-vf', vf, '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-profile:v', 'high', '-level', '5.1',
                '-r', str(args.fps), '-movflags', '+faststart', '-shortest', args.out]
    enc = subprocess.Popen(enc_cmd, stdin=subprocess.PIPE)

    frame_bytes = w * h * 3
    n, t0 = 0, time.time()
    while True:
        buf = dec.stdout.read(frame_bytes)
        if len(buf) < frame_bytes:
            break
        x = np.frombuffer(buf, np.uint8).reshape(h, w, 3).astype(np.float32).transpose(2, 0, 1)[None] / 255.0
        y = sess.run(None, {'input': x})[0][0]
        enc.stdin.write((np.clip(y, 0, 1).transpose(1, 2, 0) * 255.0 + 0.5).astype(np.uint8).tobytes())
        n += 1
        el = time.time() - t0
        print(f'\r{os.path.basename(args.out)}: {n} quadros ({el / n:.1f}s/quadro)', end='', file=sys.stderr, flush=True)
    enc.stdin.close()
    enc.wait(); dec.wait()
    print(f'\n{args.out}: {n} quadros em {time.time() - t0:.0f}s', file=sys.stderr)


if __name__ == '__main__':
    main()
