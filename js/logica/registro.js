/**
 * Registro de ações do painel (tabela "auditoria"): frases em português para cada ação e os
 * grupos do filtro. Os nomes das ações são os que o servidor grava em registrarAuditoria().
 * Funciona no navegador (window.Loja.registro) e no Node (module.exports) para os testes.
 */
(function (raiz) {
  'use strict';

  const ambienteNode = typeof module !== 'undefined' && module.exports;
  const utilidades = ambienteNode ? require('./utilidades.js') : raiz.Loja.utilidades;

  /** Grupos do filtro "Tipo": o painel manda a lista de ações do grupo para o servidor. */
  const GRUPOS_DE_ACOES = {
    acessos: {
      rotulo: 'Entradas e saídas',
      acoes: ['login', 'logout', 'codigo_recuperacao_usado', 'status_alterado'],
    },
    catalogo: {
      rotulo: 'Produtos e estoque',
      acoes: ['produto_salvo', 'produto_excluido', 'foto_enviada'],
    },
    vendas: {
      rotulo: 'Vendas',
      acoes: ['venda_balcao', 'pedido_vendido', 'pedido_cancelado'],
    },
    loja: {
      rotulo: 'Configurações da loja',
      acoes: ['contatos_salvos', 'configuracao_salva', 'backup_baixado', 'fotos_sem_uso_apagadas'],
    },
    seguranca: {
      rotulo: 'Equipe e segurança',
      acoes: [
        'senha_trocada',
        'funcionario_cadastrado',
        'funcionario_senha_redefinida',
        'funcionario_ativado',
        'funcionario_desativado',
        'funcionario_dois_fatores_desativado',
        'dois_fatores_ativado',
        'dois_fatores_desativado',
        'codigos_recuperacao_trocados',
      ],
    },
  };

  const entreAspas = (texto) => `"${texto}"`;
  const comForma = (detalhes) => (detalhes.forma ? ` (${utilidades.rotularFormaDePagamento(detalhes.forma)})` : '');
  const listarNomes = (nomes) => (Array.isArray(nomes) && nomes.length ? nomes.join(', ') : 'nenhum');

  const DESCRICOES = {
    login: () => 'Entrou no painel',
    logout: () => 'Saiu do painel',
    codigo_recuperacao_usado: () => 'Entrou com um código de recuperação (sem o app do celular)',
    status_alterado: (detalhes) => `Mudou o status para ${utilidades.rotularStatus(detalhes.status)}`,
    produto_salvo: (detalhes) => `Salvou o produto ${entreAspas(detalhes.nome)}`,
    produto_excluido: (detalhes) => `Excluiu o produto ${entreAspas(detalhes.nome)}`,
    foto_enviada: () => 'Enviou uma foto de produto',
    venda_balcao: (detalhes) => `Registrou a venda nº ${detalhes.pedido} no balcão${comForma(detalhes)}`,
    pedido_vendido: (detalhes) => `Marcou o pedido nº ${detalhes.pedido} como vendido${comForma(detalhes)}`,
    pedido_cancelado: (detalhes) => `Cancelou o pedido nº ${detalhes.pedido}`,
    contatos_salvos: (detalhes) =>
      `Alterou os atendentes do WhatsApp (ligados: ${listarNomes(detalhes.ligados)}; desligados: ${listarNomes(detalhes.desligados)})`,
    configuracao_salva: (detalhes) => `Mudou o pedido mínimo para ${utilidades.formatarMoeda(detalhes.valorMinimo)}`,
    backup_baixado: () => 'Baixou o backup completo da loja',
    fotos_sem_uso_apagadas: (detalhes) =>
      `Apagou ${detalhes.quantidade} ${detalhes.quantidade === 1 ? 'foto sem uso' : 'fotos sem uso'} (${utilidades.formatarTamanhoDeArquivo(detalhes.bytes)})`,
    senha_trocada: () => 'Trocou a própria senha',
    funcionario_cadastrado: (detalhes) => `Cadastrou o funcionário ${detalhes.usuario}`,
    funcionario_senha_redefinida: (detalhes) => `Redefiniu a senha de ${detalhes.usuario}`,
    funcionario_ativado: (detalhes) => `Reativou o funcionário ${detalhes.usuario}`,
    funcionario_desativado: (detalhes) => `Desativou o funcionário ${detalhes.usuario}`,
    funcionario_dois_fatores_desativado: (detalhes) => `Desligou a verificação em duas etapas de ${detalhes.usuario}`,
    dois_fatores_ativado: () => 'Ativou a verificação em duas etapas',
    dois_fatores_desativado: () => 'Desativou a verificação em duas etapas',
    codigos_recuperacao_trocados: () => 'Gerou novos códigos de recuperação',
  };

  /** Frase do registro (ex.: 'Salvou o produto "Vestido Midi"'); ação desconhecida aparece pelo nome. */
  function descreverAcao(registro) {
    const descrever = DESCRICOES[registro.acao];
    return descrever ? descrever(registro.detalhes || {}) : registro.acao;
  }

  /** Ações de um grupo do filtro ("" ou grupo desconhecido = todas). */
  function listarAcoesDoGrupo(grupo) {
    return GRUPOS_DE_ACOES[grupo] ? GRUPOS_DE_ACOES[grupo].acoes : [];
  }

  const api = { GRUPOS_DE_ACOES, descreverAcao, listarAcoesDoGrupo };

  if (ambienteNode) {
    module.exports = api;
  } else {
    raiz.Loja = raiz.Loja || {};
    raiz.Loja.registro = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
