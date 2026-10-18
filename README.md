npm init -y | 
npm install express multer sqlite3 cors |
node server.js


node -v v20.19.4 |
npm -v 10.8.2

## Estúdio de Reels

Editor de Reels 9:16 para conteúdo de medicina, em `/reels/studio.html` (botão "🎬 Estúdio de Reels" no topo).

- Interface gráfica: cenas, 4 looks (Impacto, Clínico, Editorial, Retrô), pré-visualização com som, linha do tempo,
  zona segura do Instagram, checklist viral e legenda do post.
- Vídeos próprios como fundo das cenas, com adesivos estilo scrapbook (pílulas, setas rabiscadas, barra de pesquisa).
- Música original gerada por código (pop eletrônico, pop leve, cinemático ou lo-fi), efeitos sincronizados e som
  ambiente do vídeo tratado (redução de ruído), mixados para celular e masterizados em -14 LUFS.
- Render MP4 1080x1920 (H.264/AAC, -14 LUFS) pelo botão "Renderizar MP4" ou no terminal:

```
node scripts/render-reel.js public/reels/templates/avc-samu.json
```

Requer `ffmpeg` e Playwright com Chromium. Vídeos enviados ficam em `reels/media/` e os renders em `reels/out/`
(os dois fora do git). Prompt para criar novos Reels: `docs/reels/PROMPT-REEL-MEDICINA.md`.
Pesquisa de referência: `docs/reels/PESQUISA.md`.
