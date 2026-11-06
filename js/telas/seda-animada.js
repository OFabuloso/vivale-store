/**
 * Desenha a seda do fundo com WebGL, ondulando e brilhando conforme a passagem do mouse.
 * Se algo falhar, o elemento é removido e a imagem parada do CSS continua aparecendo atrás.
 */
(function (raiz) {
  'use strict';

  const {
    MAXIMO_DE_ONDAS,
    calcularForcaDaOnda,
    calcularIntensidadeDoBrilho,
    registrarOnda,
    removerOndasExpiradas,
    animacaoAindaAtiva,
    suavizarValor,
    calcularEscalaCover,
    renderizadorPorSoftware,
  } = raiz.Loja.ondulacao;

  const ENDERECO_DA_TEXTURA = 'img/marca/fundo-seda.jpg';
  const CAMPOS_POR_ONDA = 4;

  const CODIGO_DOS_VERTICES = `
    attribute vec2 aPosicao;
    varying vec2 vPonto;
    void main() {
      // vPonto vai de 0 a 1, com o zero no canto superior esquerdo, como na imagem
      vPonto = vec2(aPosicao.x * 0.5 + 0.5, 0.5 - aPosicao.y * 0.5);
      gl_Position = vec4(aPosicao, 0.0, 1.0);
    }
  `;

  const CODIGO_DOS_PIXELS = `
    precision highp float;

    const int TOTAL_DE_ONDAS = ${MAXIMO_DE_ONDAS};
    const float FREQUENCIA = 22.0;
    const float VELOCIDADE = 5.5;
    const float QUEDA_COM_A_DISTANCIA = 5.5;
    const float DESLOCAMENTO_DO_TECIDO = 0.022;
    const float LUZ_DAS_DOBRAS = 0.3;
    const float LUZ_DO_BRILHO = 0.22;
    const float RAIO_DO_BRILHO = 0.32;
    // Mesma camada escura do CSS (body::before), para o desenho coincidir com a imagem parada
    const vec3 COR_DA_CAMADA = vec3(12.0, 13.0, 16.0) / 255.0;
    const float OPACIDADE_DA_CAMADA = 0.55;
    // Luz neutra: um tom quente sobre a seda azulada fica marrom e parece sujo
    const vec3 COR_DA_LUZ = vec3(1.0, 0.98, 0.95);
    // De onde vem a luz (do alto, à esquerda): ilumina só um lado de cada dobra
    const vec2 DIRECAO_DA_LUZ = vec2(-0.6, -0.8);

    uniform sampler2D uTextura;
    uniform vec2 uEscalaCover;
    uniform float uProporcaoDaTela;
    // Cada onda: horizontal, vertical, idade em segundos e força
    uniform vec4 uOndas[TOTAL_DE_ONDAS];
    // Brilho: horizontal, vertical e intensidade
    uniform vec3 uBrilho;
    varying vec2 vPonto;

    void main() {
      vec2 proporcao = vec2(uProporcaoDaTela, 1.0);
      vec2 pontoNaTela = vPonto * proporcao;
      vec2 deslocamento = vec2(0.0);
      float luzDasDobras = 0.0;

      for (int indice = 0; indice < TOTAL_DE_ONDAS; indice++) {
        vec4 onda = uOndas[indice];
        vec2 afastamento = pontoNaTela - onda.xy * proporcao;
        float distancia = length(afastamento) + 0.0001;
        float fase = distancia * FREQUENCIA - onda.z * VELOCIDADE;
        // Zerar a onda no centro evita uma marca no ponto onde a direção muda de repente
        float suavizacaoDoCentro = smoothstep(0.0, 0.08, distancia);
        float alcance = exp(-distancia * QUEDA_COM_A_DISTANCIA) * onda.w * suavizacaoDoCentro;
        deslocamento += (afastamento / distancia) * sin(fase) * alcance;
        vec2 direcaoDaDobra = afastamento / distancia;
        luzDasDobras += dot(direcaoDaDobra, DIRECAO_DA_LUZ) * cos(fase) * alcance;
      }

      vec2 pontoNaImagem = vPonto + deslocamento * DESLOCAMENTO_DO_TECIDO / proporcao;
      vec3 corDoTecido = texture2D(uTextura, (pontoNaImagem - 0.5) * uEscalaCover + 0.5).rgb;
      float claridade = dot(corDoTecido, vec3(0.3, 0.59, 0.11));

      vec3 corFinal = mix(corDoTecido, COR_DA_CAMADA, OPACIDADE_DA_CAMADA);
      corFinal += LUZ_DAS_DOBRAS * luzDasDobras * (0.08 + claridade) * COR_DA_LUZ;

      // A luz acompanha o mouse e realça a textura, como um reflexo no cetim
      vec2 afastamentoDoBrilho = (pontoNaTela - uBrilho.xy * proporcao) / RAIO_DO_BRILHO;
      float areaDoBrilho = exp(-dot(afastamentoDoBrilho, afastamentoDoBrilho));
      corFinal += LUZ_DO_BRILHO * uBrilho.z * areaDoBrilho * (0.02 + claridade) * COR_DA_LUZ;

      gl_FragColor = vec4(corFinal, 1.0);
    }
  `;

  function compilarPrograma(contexto) {
    const programa = contexto.createProgram();
    [
      [contexto.VERTEX_SHADER, CODIGO_DOS_VERTICES],
      [contexto.FRAGMENT_SHADER, CODIGO_DOS_PIXELS],
    ].forEach(([tipo, codigo]) => {
      const parte = contexto.createShader(tipo);
      contexto.shaderSource(parte, codigo);
      contexto.compileShader(parte);
      contexto.attachShader(programa, parte);
    });
    contexto.linkProgram(programa);
    if (!contexto.getProgramParameter(programa, contexto.LINK_STATUS)) {
      throw new Error(contexto.getProgramInfoLog(programa) || 'Falha ao compilar a seda animada.');
    }
    return programa;
  }

  function iniciar() {
    const tela = document.createElement('canvas');
    tela.className = 'fundo-seda-animado';
    tela.setAttribute('aria-hidden', 'true');
    const contexto = tela.getContext('webgl', {
      alpha: false,
      antialias: false,
      failIfMajorPerformanceCaveat: true,
      powerPreference: 'low-power',
    });
    if (!contexto) return;

    // A opção acima nem sempre recusa o desenho por software, que pesaria: fica a imagem parada
    const informacoesDaPlaca = contexto.getExtension('WEBGL_debug_renderer_info');
    if (
      informacoesDaPlaca &&
      renderizadorPorSoftware(contexto.getParameter(informacoesDaPlaca.UNMASKED_RENDERER_WEBGL))
    ) {
      return;
    }

    const midiaMenosMovimento = raiz.matchMedia('(prefers-reduced-motion: reduce)');
    const programa = compilarPrograma(contexto);
    contexto.useProgram(programa);

    // Um triângulo grande que cobre a tela inteira
    contexto.bindBuffer(contexto.ARRAY_BUFFER, contexto.createBuffer());
    contexto.bufferData(contexto.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), contexto.STATIC_DRAW);
    const atributoPosicao = contexto.getAttribLocation(programa, 'aPosicao');
    contexto.enableVertexAttribArray(atributoPosicao);
    contexto.vertexAttribPointer(atributoPosicao, 2, contexto.FLOAT, false, 0, 0);

    const uniformes = {
      escalaCover: contexto.getUniformLocation(programa, 'uEscalaCover'),
      proporcaoDaTela: contexto.getUniformLocation(programa, 'uProporcaoDaTela'),
      ondas: contexto.getUniformLocation(programa, 'uOndas'),
      brilho: contexto.getUniformLocation(programa, 'uBrilho'),
    };
    const dadosDasOndas = new Float32Array(MAXIMO_DE_ONDAS * CAMPOS_POR_ONDA);

    const imagem = new Image();
    let ondas = [];
    let ultimoMovimento = -Infinity;
    let instanteDoQuadroAnterior = 0;
    const posicaoDoMouse = { horizontal: 0.5, vertical: 0.5 };
    const posicaoDoBrilho = { horizontal: 0.5, vertical: 0.5 };
    let quadroPendente = null;
    let desativada = false;

    function desativar() {
      desativada = true;
      if (quadroPendente !== null) raiz.cancelAnimationFrame(quadroPendente);
      quadroPendente = null;
      tela.remove();
    }

    function ajustarTamanho() {
      // Resolução limitada a 1x: a textura é suave e isso reduz bastante o trabalho da placa de vídeo
      const larguraTela = raiz.innerWidth;
      const alturaTela = raiz.innerHeight;
      tela.width = larguraTela;
      tela.height = alturaTela;
      contexto.viewport(0, 0, larguraTela, alturaTela);
      const escala = calcularEscalaCover(larguraTela, alturaTela, imagem.naturalWidth, imagem.naturalHeight);
      contexto.uniform2f(uniformes.escalaCover, escala.horizontal, escala.vertical);
      contexto.uniform1f(uniformes.proporcaoDaTela, larguraTela / alturaTela);
    }

    function desenhar(instante) {
      ondas = removerOndasExpiradas(ondas, instante);
      dadosDasOndas.fill(0);
      ondas.forEach((onda, indice) => {
        const idadeMs = instante - onda.inicio;
        dadosDasOndas.set(
          [onda.horizontal, onda.vertical, idadeMs / 1000, calcularForcaDaOnda(idadeMs)],
          indice * CAMPOS_POR_ONDA,
        );
      });

      const tempoDecorrido = instante - instanteDoQuadroAnterior;
      instanteDoQuadroAnterior = instante;
      posicaoDoBrilho.horizontal = suavizarValor(posicaoDoBrilho.horizontal, posicaoDoMouse.horizontal, tempoDecorrido);
      posicaoDoBrilho.vertical = suavizarValor(posicaoDoBrilho.vertical, posicaoDoMouse.vertical, tempoDecorrido);

      contexto.uniform4fv(uniformes.ondas, dadosDasOndas);
      contexto.uniform3f(
        uniformes.brilho,
        posicaoDoBrilho.horizontal,
        posicaoDoBrilho.vertical,
        calcularIntensidadeDoBrilho(instante - ultimoMovimento),
      );
      contexto.drawArrays(contexto.TRIANGLES, 0, 3);
    }

    function pedirQuadro() {
      if (quadroPendente === null && !desativada && !document.hidden) {
        quadroPendente = raiz.requestAnimationFrame(executarQuadro);
      }
    }

    function executarQuadro(instante) {
      quadroPendente = null;
      desenhar(instante);
      // Sem ondas nem brilho o laço termina e a placa de vídeo descansa até o próximo movimento
      if (animacaoAindaAtiva(ondas, instante, ultimoMovimento)) pedirQuadro();
    }

    function tratarMovimentoDoMouse(evento) {
      if (evento.pointerType !== 'mouse' || midiaMenosMovimento.matches) return;
      const instante = raiz.performance.now();
      const posicao = {
        horizontal: evento.clientX / raiz.innerWidth,
        vertical: evento.clientY / raiz.innerHeight,
      };
      posicaoDoMouse.horizontal = posicao.horizontal;
      posicaoDoMouse.vertical = posicao.vertical;
      // Com o brilho apagado ele nasce no mouse, em vez de atravessar a tela até ele
      if (calcularIntensidadeDoBrilho(instante - ultimoMovimento) === 0) {
        posicaoDoBrilho.horizontal = posicao.horizontal;
        posicaoDoBrilho.vertical = posicao.vertical;
        instanteDoQuadroAnterior = instante;
      }
      ultimoMovimento = instante;
      ondas = registrarOnda(ondas, posicao, instante, raiz.innerWidth / raiz.innerHeight);
      pedirQuadro();
    }

    imagem.onerror = desativar;
    imagem.onload = () => {
      const textura = contexto.createTexture();
      contexto.bindTexture(contexto.TEXTURE_2D, textura);
      contexto.texImage2D(contexto.TEXTURE_2D, 0, contexto.RGB, contexto.RGB, contexto.UNSIGNED_BYTE, imagem);
      // Essa combinação aceita imagens de qualquer tamanho e evita repetição nas bordas
      contexto.texParameteri(contexto.TEXTURE_2D, contexto.TEXTURE_WRAP_S, contexto.CLAMP_TO_EDGE);
      contexto.texParameteri(contexto.TEXTURE_2D, contexto.TEXTURE_WRAP_T, contexto.CLAMP_TO_EDGE);
      contexto.texParameteri(contexto.TEXTURE_2D, contexto.TEXTURE_MIN_FILTER, contexto.LINEAR);
      contexto.texParameteri(contexto.TEXTURE_2D, contexto.TEXTURE_MAG_FILTER, contexto.LINEAR);

      ajustarTamanho();
      desenhar(raiz.performance.now());
      document.body.prepend(tela);
      tela.classList.add('pronto');

      raiz.addEventListener('pointermove', tratarMovimentoDoMouse, { passive: true });
      raiz.addEventListener('resize', () => {
        ajustarTamanho();
        desenhar(raiz.performance.now());
      });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && quadroPendente !== null) {
          raiz.cancelAnimationFrame(quadroPendente);
          quadroPendente = null;
        } else if (!document.hidden) {
          pedirQuadro();
        }
      });
    };
    tela.addEventListener('webglcontextlost', desativar);
    imagem.src = ENDERECO_DA_TEXTURA;
  }

  try {
    iniciar();
  } catch (erro) {
    console.warn('Seda animada desativada; o fundo continua com a imagem parada.', erro);
  }
})(window);
