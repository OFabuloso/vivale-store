/**
 * Visualizador da foto em tela cheia para celular e tablet:
 * pinça para ampliar, arraste para mover e toque duplo para ampliar/voltar.
 */
(function (raiz) {
  'use strict';

  const { zoom } = raiz.Loja;

  // Intervalo e distância máximos entre dois toques para contar como toque duplo
  const INTERVALO_TOQUE_DUPLO_MS = 300;
  const DISTANCIA_TOQUE_DUPLO_PX = 30;

  const elementos = {};
  // Dedos encostados na tela, pela identificação do ponteiro: { x, y }
  const ponteirosAtivos = new Map();
  const estado = { escala: 1, deslocamentoX: 0, deslocamentoY: 0 };
  let pinca = null;
  let arraste = null;
  let ultimoToque = null;

  function iniciar() {
    elementos.janela = document.getElementById('visualizador-foto');
    elementos.area = document.getElementById('visualizador-foto-area');
    elementos.imagem = document.getElementById('visualizador-foto-imagem');

    elementos.janela.addEventListener('click', (evento) => {
      const clicouEmFechar = evento.target.closest('[data-fechar]');
      // Tocar fora da foto fecha, mas só quando ela não está ampliada
      const clicouNoFundo = evento.target === elementos.area && estado.escala === 1;
      if (clicouEmFechar || clicouNoFundo) elementos.janela.close();
    });
    elementos.janela.addEventListener('close', redefinirZoom);

    elementos.area.addEventListener('pointerdown', aoEncostarDedo);
    elementos.area.addEventListener('pointermove', aoMoverDedo);
    elementos.area.addEventListener('pointerup', aoSoltarDedo);
    elementos.area.addEventListener('pointercancel', aoSoltarDedo);
  }

  function abrir(enderecoFoto, descricao) {
    elementos.imagem.src = enderecoFoto;
    elementos.imagem.alt = descricao || '';
    redefinirZoom();
    elementos.janela.showModal();
  }

  function redefinirZoom() {
    estado.escala = 1;
    estado.deslocamentoX = 0;
    estado.deslocamentoY = 0;
    ponteirosAtivos.clear();
    pinca = null;
    arraste = null;
    aplicarTransformacao();
  }

  function aplicarTransformacao() {
    const { escala, deslocamentoX, deslocamentoY } = estado;
    elementos.imagem.style.transform = `translate(${deslocamentoX}px, ${deslocamentoY}px) scale(${escala})`;
    elementos.janela.classList.toggle('ampliada', escala > 1);
    elementos.janela.classList.toggle('em-gesto', ponteirosAtivos.size > 0);
  }

  /** Tamanho da área e da foto encaixada nela (sem zoom), em { largura, altura }. */
  function medirAreaEFoto() {
    const { width: largura, height: altura } = elementos.area.getBoundingClientRect();
    const tamanhoDaArea = { largura, altura };
    const tamanhoOriginal = { largura: elementos.imagem.naturalWidth, altura: elementos.imagem.naturalHeight };
    return { tamanhoDaArea, tamanhoDaImagem: zoom.calcularTamanhoExibido(tamanhoOriginal, tamanhoDaArea) };
  }

  /** Recalcula o deslocamento para a foto não sair da área visível. */
  function manterDentroDaArea() {
    const { tamanhoDaArea, tamanhoDaImagem } = medirAreaEFoto();
    estado.deslocamentoX = zoom.limitarDeslocamento(
      estado.deslocamentoX,
      estado.escala,
      tamanhoDaArea.largura,
      tamanhoDaImagem.largura,
    );
    estado.deslocamentoY = zoom.limitarDeslocamento(
      estado.deslocamentoY,
      estado.escala,
      tamanhoDaArea.altura,
      tamanhoDaImagem.altura,
    );
  }

  function obterDoisDedos() {
    const [primeiroDedo, segundoDedo] = [...ponteirosAtivos.values()];
    return { primeiroDedo, segundoDedo };
  }

  function aoEncostarDedo(evento) {
    elementos.area.setPointerCapture(evento.pointerId);
    ponteirosAtivos.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });

    if (ponteirosAtivos.size === 2) {
      const { primeiroDedo, segundoDedo } = obterDoisDedos();
      pinca = { escalaInicial: estado.escala, distanciaInicial: zoom.calcularDistancia(primeiroDedo, segundoDedo) };
      arraste = null;
    } else if (ponteirosAtivos.size === 1) {
      arraste = {
        inicioX: evento.clientX,
        inicioY: evento.clientY,
        deslocamentoInicialX: estado.deslocamentoX,
        deslocamentoInicialY: estado.deslocamentoY,
      };
    }
  }

  function aoMoverDedo(evento) {
    if (!ponteirosAtivos.has(evento.pointerId)) return;
    ponteirosAtivos.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });

    if (pinca && ponteirosAtivos.size === 2) {
      const { primeiroDedo, segundoDedo } = obterDoisDedos();
      const distanciaAtual = zoom.calcularDistancia(primeiroDedo, segundoDedo);
      estado.escala = zoom.calcularEscalaDaPinca(pinca.escalaInicial, pinca.distanciaInicial, distanciaAtual);
    } else if (arraste && estado.escala > 1) {
      estado.deslocamentoX = arraste.deslocamentoInicialX + (evento.clientX - arraste.inicioX);
      estado.deslocamentoY = arraste.deslocamentoInicialY + (evento.clientY - arraste.inicioY);
    } else {
      return;
    }
    manterDentroDaArea();
    aplicarTransformacao();
  }

  function aoSoltarDedo(evento) {
    if (!ponteirosAtivos.has(evento.pointerId)) return;
    const eraUmToqueSo = ponteirosAtivos.size === 1 && !pinca;
    ponteirosAtivos.delete(evento.pointerId);

    if (ponteirosAtivos.size < 2) pinca = null;
    if (ponteirosAtivos.size === 0) arraste = null;

    // Depois da pinça, o dedo que ficou na tela continua arrastando dali
    if (ponteirosAtivos.size === 1) {
      const [dedoRestante] = ponteirosAtivos.values();
      arraste = {
        inicioX: dedoRestante.x,
        inicioY: dedoRestante.y,
        deslocamentoInicialX: estado.deslocamentoX,
        deslocamentoInicialY: estado.deslocamentoY,
      };
    }

    if (eraUmToqueSo && evento.pointerType !== 'mouse') verificarToqueDuplo(evento);
  }

  function verificarToqueDuplo(evento) {
    const agora = Date.now();
    const toqueAtual = { momento: agora, x: evento.clientX, y: evento.clientY };
    const foiToqueDuplo =
      ultimoToque &&
      agora - ultimoToque.momento < INTERVALO_TOQUE_DUPLO_MS &&
      zoom.calcularDistancia(ultimoToque, toqueAtual) < DISTANCIA_TOQUE_DUPLO_PX;

    if (!foiToqueDuplo) {
      ultimoToque = toqueAtual;
      return;
    }
    ultimoToque = null;

    const area = elementos.area.getBoundingClientRect();
    const pontoTocado = {
      x: evento.clientX - (area.left + area.width / 2),
      y: evento.clientY - (area.top + area.height / 2),
    };
    const { tamanhoDaArea, tamanhoDaImagem } = medirAreaEFoto();
    Object.assign(
      estado,
      zoom.alternarZoomDoToqueDuplo(estado.escala, pontoTocado, tamanhoDaArea, tamanhoDaImagem),
    );
    aplicarTransformacao();
  }

  raiz.Loja.visualizadorFoto = { iniciar, abrir };
})(window);
