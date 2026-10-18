# Prompt mestre — Reel de medicina com alto alcance

Cole o bloco abaixo no Claude Code, dentro deste repositório. Troque só o que está
entre `{chaves}`. O Claude escreve o roteiro como JSON, confere a folha de contato e
renderiza o MP4 com o Estúdio de Reels do UniHub.

---

```text
Você é roteirista e editor de Reels de medicina. Seu público são leigos e
estudantes de saúde que rolam o feed no celular, sem som na metade das vezes.
Quero um Reel que gere muitos compartilhamentos e salvamentos, sem sensacionalismo
e com informação correta.

TEMA: {tema — ex.: "como reconhecer um AVC em 10 segundos"}
PERFIL: @med.vihm   LOOK: {impacto | clinico | editorial | retro}   DURAÇÃO: 25–35 s
MEUS VÍDEOS: {arquivos em reels/media/ — ou "nenhum"}

1. ESCOLHA DO ÂNGULO
   - Prefira conteúdo que a pessoa vai querer ENVIAR para alguém ("isso pode
     salvar a vida do seu pai"): primeiros socorros, sinais de alerta, mitos
     comuns, um número que choca.
   - Um único conceito por vídeo. Se precisar de uma sigla ou de uma regra
     simples, use (siglas são fáceis de lembrar e de compartilhar).

2. GANCHO (0–3 s) — decide se a pessoa fica
   - No máximo 12 palavras na tela, legíveis sem som.
   - Use uma lacuna de curiosidade + benefício concreto ("4 letras que podem
     salvar uma vida"). Nada de "Oi, gente" nem introdução.
   - Destaque 1–2 palavras com marca-texto (campo "highlight").

3. ESTRUTURA (tipos de cena do motor: hook, stat, step, list, myth, recap, cta, clip)
   hook → stat (número de impacto com fonte) → 3–5 steps ou list → myth
   (corrige o erro mais comum) → recap (sigla inteira) → cta.
   - Cenas de 3–4 s. Algo muda na tela a cada 1–2 s (o motor anima palavras,
     ícones, contadores e transições).
   - Legenda palavra a palavra (campo "caption") onde houver narração; não
     repita na legenda o texto que já está grande na tela.
   - O CTA pede uma ação específica: "Salve e envie para quem você ama". O
     último texto deve "rimar" com o gancho, para o vídeo rodar em loop.
   - Se houver vídeos meus: rostos aumentam a retenção. Coloque-me no gancho
     e no CTA ("media" com dim 0.6) e use cenas "clip" com adesivos em pílula,
     setas rabiscadas e barra de pesquisa ("como intubar?") — estilo scrapbook
     do Canva (look retro). Antes de escolher trechos, gere uma folha de
     quadros com ffmpeg e evite partes com texto já queimado no vídeo.

4. RIGOR MÉDICO (obrigatório)
   - Só afirmações aceitas por diretrizes ou fontes oficiais (Ministério da
     Saúde, sociedades médicas, artigos de referência). Cite a fonte na cena
     do número ("source") e na legenda do post.
   - Nada de prometer cura, diagnóstico pelo vídeo, antes/depois de paciente
     nem autopromoção que fira a Resolução CFM nº 2.336/2023 (publicidade médica).
   - Inclua o aviso: "Conteúdo educativo. Não substitui avaliação médica.
     Emergência: ligue 192." Em vídeos de procedimento, deixe claro que é
     simulador / treino supervisionado.

5. ENTREGA
   a) Escreva o roteiro em public/reels/templates/{slug}.json seguindo o
      formato dos modelos já existentes (veja avc-samu.json).
   b) Rode: node scripts/render-reel.js public/reels/templates/{slug}.json --sheet
      Abra reels/out/{slug}-folha.jpg e confira: texto dentro da zona segura,
      nada cortado, contraste bom, gancho legível em 1 s. Corrija e repita.
   c) Rode sem --sheet para gerar o MP4 (1080x1920, 30 fps, H.264/AAC, -14 LUFS).
   d) Escreva reels/out/{slug}-post.md com: legenda do post (primeira linha =
      gancho, depois 3–5 linhas de valor, CTA, fontes, aviso) e 5–8 hashtags
      de nicho + amplas em português; sugestão de horário de postagem e de
      texto para a capa.
   e) Rode o checklist viral do Estúdio (public/reels/studio.html) e informe a nota.
```

---

## Por que esse formato tende a ter alcance

- **Gancho em 3 s + lacuna de curiosidade.** Guias de Reels de 2026 apontam a
  saída nos primeiros 3 segundos como a métrica que mais pesa.
- **Compartilhamento e salvamento.** Os mesmos guias colocam envios e
  salvamentos entre os sinais mais fortes; conteúdo que "pode salvar alguém"
  é enviado para familiares.
- **Legível sem som.** Legendas palavra a palavra e texto grande na tela.
- **Loop.** O fim conversa com o começo, o que aumenta o tempo assistido.
- **Ritmo.** Algo muda a cada 1–2 s, como nos fluxos de edição com Claude Code
  (tipografia cinética, punch zoom e marca-texto).

Esses pontos vêm de blogs de marketing, não de dados oficiais do Instagram;
trate-os como hipóteses e compare com as métricas do seu perfil.
