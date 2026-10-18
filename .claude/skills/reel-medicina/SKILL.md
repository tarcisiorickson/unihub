---
name: reel-medicina
description: Cria Reels verticais (1080x1920) de medicina com o Estúdio de Reels do UniHub — roteiro em JSON, tipografia cinética, legendas palavra a palavra, vídeos próprios do criador com adesivos estilo scrapbook, trilha sintetizada e render MP4. Use quando pedirem um Reel, vídeo curto, TikTok ou Shorts de saúde/medicina, ou quiserem editar vídeos próprios para o Instagram.
---

# Reel de medicina com o Estúdio do UniHub

## Arquivos

- `public/reels/engine.js`: motor (função pura do tempo). Tipos de cena: `hook`, `stat`, `step`, `list`, `myth`, `recap`, `cta`, `clip`.
- `public/reels/soundtrack.js`: trilha (pad + batimento + efeitos sincronizados aos eventos).
- `public/reels/studio.html`: interface gráfica (abra em `/reels/studio.html` com `npm start`).
- `scripts/render-reel.js`: render headless → MP4 H.264/AAC, -14 LUFS, capa e folha de contato.
- `public/reels/templates/*.json`: modelos (use como referência de formato).
- `reels/media/`: vídeos do criador (fora do git; o repositório é público).
- `reels/out/`: renders (fora do git).

## Fluxo

1. **Brief**: tema, perfil (padrão `@med.vihm`), look (`impacto`, `clinico`, `editorial`, `retro`) e se há vídeos próprios.
2. **Roteiro**: siga `docs/reels/PROMPT-REEL-MEDICINA.md`. Gancho ≤ 12 palavras em ≤ 3,5 s, cenas de 3–5 s,
   número com fonte ou mito × verdade, CTA de salvar/enviar e aviso médico.
3. **Vídeos próprios**: copie para `reels/media/` e veja os quadros antes de escolher trechos:
   `ffmpeg -ss 0 -i reels/media/X.mp4 -vf "fps=1,scale=150:-1,tile=8x3" -frames:v 1 folha.jpg`.
   Evite trechos com texto já queimado no vídeo. Use `"media": {"src", "from", "dim", "zoom", "grade"}` em
   qualquer cena, ou `type: "clip"` com `title`, `subtitle`, `search`, `stickers`, `shout`.
4. **QA**: `node scripts/render-reel.js <roteiro.json> --sheet` e abra `reels/out/<nome>-folha.jpg`.
   Para conferir um instante: `--frame 3.2`. Corrija texto fora da zona segura, sobreposições e contraste.
5. **Render**: `node scripts/render-reel.js <roteiro.json>` (cerca de 3 min para 30 s).
6. **Post**: preencha `post.caption` (gancho, valor, CTA, fontes, aviso) e `post.hashtags` (3–10).
   O checklist do Estúdio deve chegar a 100.

## Regras médicas

- Só afirmações com respaldo (Ministério da Saúde, sociedades, diretrizes, artigos de referência) e fonte citada.
- Nada de promessa de cura, diagnóstico pelo vídeo ou antes/depois de paciente (Resolução CFM nº 2.336/2023).
- Vídeos de procedimento: deixe claro que é simulador/treino supervisionado.
