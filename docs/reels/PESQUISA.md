# Pesquisa: edição de vídeo com Claude Code (out/2026)

O Instagram não pode ser navegado sem login, então a pesquisa usou páginas públicas que
documentam os fluxos que circulam em Reels e no GitHub. Cada técnica abaixo leva ao que foi
implementado no Estúdio de Reels.

| Tendência encontrada | Onde aparece | Como entrou no UniHub |
| --- | --- | --- |
| Claude Code + **Remotion**: vídeo escrito como código e renderizado em 9:16 | nemovideo, mejba.me, guia em russo do vc.ru | Motor próprio em Canvas (`engine.js`), sem licença extra, com o mesmo princípio: quadro = função do tempo |
| Skill que pega **clipes brutos** e entrega um Reel pronto, com 3 "looks" visuais e checagem quadro a quadro | `tenfoldmarc/video-edit-skill` | 4 looks (Impacto, Clínico, Editorial, Retrô), cenas `clip` com o seu vídeo, folha de contato para QA |
| **Tipografia cinética**, legendas atrás do assunto, punch zoom, sound design sincronizado, -14 LUFS, etapas de aprovação | `Motion-graphics-skill` | Palavras com overshoot, marca-texto, punch zoom e tremor, whoosh/impacto nos cortes, loudnorm -14 LUFS |
| **Legendas palavra a palavra** sincronizadas | `claude-remotion-skill`, ChatCut | Legendas estilo CapCut, em blocos de até 3 palavras, com a palavra ativa colorida |
| Edição guiada por **transcrição** (`video-use`), com ffmpeg para cortes | browser-use/video-use, laozhang.ai | ffmpeg extrai os trechos escolhidos; o roteiro JSON aponta `from` e a duração de cada clipe |
| **Zona segura** dos Reels | guias de Remotion e da skill de motion | Sobreposição "Zona segura" no Estúdio; o layout respeita topo, rodapé e coluna de botões |
| Estética **scrapbook do Canva** (referência enviada): letras verde-limão gigantes, flor, estrelas, pílulas com setas rabiscadas, barra de pesquisa | design "meu 2º período" e vídeos de @med.vihm | Look `retro`: flor brilhante, estrelas, adesivos em pílula com seta desenhada aos poucos, barra "como intubar? 🔍" digitando |

## Retenção e alcance (Reels de 2026)

- Os primeiros 3 segundos decidem; Instagram mede a taxa de pulo (skip rate).
- Compartilhamentos e salvamentos pesam muito, então o CTA pede "salve e envie".
- Formatos repetíveis: listas educativas, mito × verdade, bastidores (talking head / vlog).
- Essas afirmações vêm de blogs de marketing, não de dados oficiais da Meta.

## Fontes

- https://www.nemovideo.com/blog/remotion-agent-skills-claude-code-guide
- https://vc.ru/ai/2872593-claude-code-i-remotion-sozdanie-video-shortsev
- https://www.mejba.me/remotion-video-workflow-claude-code
- https://github.com/tenfoldmarc/video-edit-skill
- https://github.com/Miftahul-Islam-Efaz/Motion-graphics-skill
- https://github.com/haidrrrry/claude-remotion-skill
- https://github.com/zhuyansen/awesome-claude-video-skills
- https://chatcut.io/claude-code-plugin
- https://gittrend.io/repo/browser-use/video-use
- https://blog.laozhang.ai/en/posts/claude-code-video-editing
- https://learnwithhasan.com/guide/how-to-edit-videos-with-claude-code/
- https://charliehills.substack.com/p/ai-video-editing-guide
- https://socialz.ai/blog/instagram-reels-tips
- https://zawa.ai/resources/how-to-make-instagram-reels-go-viral
- https://www.teleprompter.com/blog/hooks-for-instagram-reels
- SAMU/AVC: https://canaltech.com.br/saude/derrame-avc-como-identificar-188856/ ·
  https://grandesnomesdapropaganda.com.br/anunciantes/boehringer-ingelheim-lanca-a-campanha-a-vida-conta/
