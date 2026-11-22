/**
 * Painel do Vendedor: CRUD de produtos, contatos do WhatsApp e configurações da loja.
 *
 * Tudo é salvo no servidor (api/admin/*) e vale para as clientes na hora.
 * O login é conferido no servidor; o navegador guarda só uma cópia para desenhar as telas.
 */
(function (raiz) {
  'use strict';

  const { armazenamento, utilidades, componentes, imagem, contatos, api } = raiz.Loja;
  const { formatarMoeda, escaparHtml, lerValorMonetario } = utilidades;

  const elementos = {};
  let idProdutoEmEdicao = null;
  let fotoAtual = '';

  function iniciar() {
    elementos.telaLogin = document.getElementById('tela-login');
    elementos.painel = document.getElementById('painel-admin');
    elementos.listaProdutos = document.getElementById('lista-produtos-admin');
    elementos.totalProdutos = document.getElementById('total-produtos');
    elementos.janelaProduto = document.getElementById('janela-formulario-produto');
    elementos.formularioProduto = document.getElementById('formulario-produto');
    elementos.tituloFormulario = document.getElementById('titulo-formulario-produto');
    elementos.erroProduto = document.getElementById('erro-produto');
    elementos.campoNome = document.getElementById('produto-nome');
    elementos.campoDescricao = document.getElementById('produto-descricao');
    elementos.campoCategoria = document.getElementById('produto-categoria');
    elementos.listaCategorias = document.getElementById('lista-categorias');
    elementos.campoPreco = document.getElementById('produto-preco');
    elementos.campoFotoArquivo = document.getElementById('produto-foto-arquivo');
    elementos.campoFotoUrl = document.getElementById('produto-foto-url');
    elementos.previaFoto = document.getElementById('produto-foto-previa');
    elementos.botaoRemoverFoto = document.getElementById('botao-remover-foto');
    elementos.caixasTamanhos = document.querySelectorAll('#produto-tamanhos input[type="checkbox"]');
    elementos.campoCores = document.getElementById('produto-cores');
    elementos.campoAtivo = document.getElementById('produto-ativo');

    document.getElementById('formulario-login').addEventListener('submit', entrar);
    document.getElementById('botao-sair').addEventListener('click', sair);
    document.querySelectorAll('.aba').forEach((aba) => aba.addEventListener('click', trocarAba));

    document.getElementById('botao-novo-produto').addEventListener('click', () => abrirFormulario(null));
    elementos.listaProdutos.addEventListener('click', tratarAcaoProduto);
    elementos.formularioProduto.addEventListener('submit', salvarFormularioProduto);
    elementos.campoFotoArquivo.addEventListener('change', tratarUploadFoto);
    elementos.campoFotoUrl.addEventListener('input', () => definirFoto(elementos.campoFotoUrl.value.trim()));
    elementos.botaoRemoverFoto.addEventListener('click', () => {
      elementos.campoFotoArquivo.value = '';
      elementos.campoFotoUrl.value = '';
      definirFoto('');
    });
    componentes.configurarJanela(elementos.janelaProduto);

    elementos.listaContatos = document.getElementById('lista-contatos-admin');
    elementos.erroContatos = document.getElementById('erro-contatos');
    elementos.listaContatos.addEventListener('click', tratarAcaoContato);
    document.getElementById('botao-adicionar-contato').addEventListener('click', adicionarContatoVazio);
    document.getElementById('formulario-contatos').addEventListener('submit', salvarContatos);
    document.getElementById('formulario-configuracao').addEventListener('submit', salvarConfiguracoes);
    document.getElementById('formulario-senha').addEventListener('submit', trocarSenha);
    document.getElementById('botao-exportar').addEventListener('click', exportarCatalogo);

    verificarSessao();
  }

  // ---------- Login ----------

  async function verificarSessao() {
    try {
      const usuario = await api.obterSessao();
      if (usuario) {
        await abrirPainel();
      } else {
        mostrarLogin();
      }
    } catch (erro) {
      mostrarLogin(erro.message);
    }
  }

  function mostrarLogin(mensagem = '') {
    elementos.painel.classList.add('oculto');
    elementos.telaLogin.classList.remove('oculto');
    const elementoErro = document.getElementById('erro-login');
    elementoErro.textContent = mensagem;
    elementoErro.classList.toggle('oculto', !mensagem);
    document.getElementById('campo-usuario').focus();
  }

  async function entrar(evento) {
    evento.preventDefault();
    const campoUsuario = document.getElementById('campo-usuario');
    const campoSenha = document.getElementById('campo-senha');
    const botaoEntrar = document.getElementById('botao-entrar');
    if (!campoUsuario.value.trim() || !campoSenha.value) {
      mostrarLogin('Informe o usuário e a senha.');
      return;
    }

    botaoEntrar.disabled = true;
    try {
      await api.entrar(campoUsuario.value.trim(), campoSenha.value);
      campoSenha.value = '';
      await abrirPainel();
    } catch (erro) {
      mostrarLogin(erro.message);
      campoSenha.select();
    } finally {
      botaoEntrar.disabled = false;
    }
  }

  async function sair() {
    try {
      await api.sair();
    } catch (erro) {
      // Mesmo sem resposta do servidor, a tela volta para o login
    }
    mostrarLogin();
  }

  /** Busca tudo no servidor, guarda a cópia no navegador e mostra o painel. */
  async function abrirPainel() {
    const dadosDoPainel = await api.carregarPainel();
    armazenamento.aplicarCatalogoDoServidor(dadosDoPainel);
    elementos.telaLogin.classList.add('oculto');
    elementos.painel.classList.remove('oculto');
    renderizarProdutos();
    preencherConfiguracoes();
  }

  /** Sessão expirada volta para o login; outros erros só mostram a mensagem. */
  function tratarErroDoServidor(erro, mostrarMensagem) {
    if (erro.codigoHttp === 401) {
      mostrarLogin('Sua sessão expirou. Entre de novo.');
      return;
    }
    mostrarMensagem(erro.message);
  }

  function trocarAba(evento) {
    const abaClicada = evento.currentTarget;
    document.querySelectorAll('.aba').forEach((aba) => {
      const selecionada = aba === abaClicada;
      aba.setAttribute('aria-selected', String(selecionada));
      document.getElementById(aba.dataset.aba).classList.toggle('oculto', !selecionada);
    });
  }

  // ---------- Lista de produtos ----------

  function renderizarProdutos() {
    const produtos = armazenamento.obterProdutos();
    elementos.totalProdutos.textContent = String(produtos.length);

    if (produtos.length === 0) {
      elementos.listaProdutos.innerHTML =
        '<p class="estado-vazio">Nenhum produto cadastrado. Clique em “Novo produto”.</p>';
      return;
    }

    elementos.listaProdutos.innerHTML = produtos.map(montarHtmlLinhaProduto).join('');
    elementos.listaProdutos.querySelectorAll('img').forEach((elementoImagem, posicao) => {
      componentes.aplicarFotoComReserva(elementoImagem, produtos[posicao]);
    });
  }

  function montarHtmlLinhaProduto(produto) {
    const ativo = produto.ativo !== false;
    return `
      <article class="linha-produto-admin ${ativo ? '' : 'inativo'}" data-id="${escaparHtml(produto.id)}">
        <img alt="" />
        <div>
          <h3>${escaparHtml(produto.nome)}${ativo ? '' : '<span class="etiqueta">Inativo</span>'}</h3>
          <p>${escaparHtml(produto.categoria)} · <strong>${formatarMoeda(produto.preco)}</strong></p>
          <p>${escaparHtml(produto.tamanhos.join(', '))} · ${escaparHtml(produto.cores.join(', '))}</p>
          <div class="acoes-produto-admin">
            <button class="botao botao-contorno botao-pequeno" type="button" data-acao="editar">Editar</button>
            <button class="botao botao-contorno botao-pequeno" type="button" data-acao="alternar">${ativo ? 'Inativar' : 'Ativar'}</button>
            <button class="botao botao-perigo botao-pequeno" type="button" data-acao="excluir">Excluir</button>
          </div>
        </div>
      </article>`;
  }

  async function tratarAcaoProduto(evento) {
    const botao = evento.target.closest('button[data-acao]');
    if (!botao) return;
    const idProduto = botao.closest('[data-id]').dataset.id;
    const produto = armazenamento.obterProdutoPorId(idProduto);
    if (!produto) return;

    if (botao.dataset.acao === 'editar') {
      abrirFormulario(produto);
    } else if (botao.dataset.acao === 'alternar') {
      botao.disabled = true;
      const salvou = await salvarComTratamento({ ...produto, ativo: produto.ativo === false });
      botao.disabled = false;
      if (salvou) {
        componentes.mostrarToast(produto.ativo === false ? 'Produto ativado' : 'Produto inativado');
      }
    } else if (botao.dataset.acao === 'excluir') {
      if (!confirm(`Excluir "${produto.nome}" definitivamente?`)) return;
      botao.disabled = true;
      try {
        await api.excluirProduto(idProduto);
        armazenamento.removerProduto(idProduto);
        renderizarProdutos();
        componentes.mostrarToast('Produto excluído');
      } catch (erro) {
        botao.disabled = false;
        tratarErroDoServidor(erro, (mensagem) => alert(mensagem));
      }
    }
  }

  // ---------- Formulário de produto ----------

  function abrirFormulario(produto) {
    idProdutoEmEdicao = produto ? produto.id : null;
    elementos.formularioProduto.reset();
    elementos.erroProduto.classList.add('oculto');
    elementos.tituloFormulario.textContent = produto ? 'Editar produto' : 'Novo produto';

    // Sugestões de categorias já existentes
    const categorias = [...new Set(armazenamento.obterProdutos().map((item) => item.categoria))];
    elementos.listaCategorias.innerHTML = categorias
      .map((categoria) => `<option value="${escaparHtml(categoria)}"></option>`)
      .join('');

    elementos.campoNome.value = produto ? produto.nome : '';
    elementos.campoDescricao.value = produto ? produto.descricao || '' : '';
    elementos.campoCategoria.value = produto ? produto.categoria : '';
    elementos.campoPreco.value = produto ? String(produto.preco).replace('.', ',') : '';
    elementos.campoCores.value = produto ? produto.cores.join(', ') : '';
    elementos.campoAtivo.checked = produto ? produto.ativo !== false : true;
    elementos.caixasTamanhos.forEach((caixa) => {
      caixa.checked = produto ? produto.tamanhos.includes(caixa.value) : true;
    });

    const fotoDoProduto = produto ? produto.foto : '';
    elementos.campoFotoUrl.value = fotoDoProduto.startsWith('data:') ? '' : fotoDoProduto;
    definirFoto(fotoDoProduto);

    elementos.janelaProduto.showModal();
    elementos.campoNome.focus();
  }

  function definirFoto(endereco) {
    fotoAtual = endereco;
    elementos.previaFoto.classList.toggle('oculto', !endereco);
    elementos.botaoRemoverFoto.classList.toggle('oculto', !endereco);
    if (endereco) elementos.previaFoto.src = endereco;
  }

  /** Reduz a foto escolhida, envia ao servidor e mostra a prévia já pelo endereço definitivo. */
  async function tratarUploadFoto() {
    const arquivo = elementos.campoFotoArquivo.files[0];
    if (!arquivo) return;
    const avisoEnviando = document.getElementById('produto-foto-enviando');
    const botaoSalvar = elementos.formularioProduto.querySelector('button[type="submit"]');
    avisoEnviando.classList.remove('oculto');
    botaoSalvar.disabled = true;
    elementos.erroProduto.classList.add('oculto');
    try {
      const fotoReduzida = await imagem.reduzirParaEnvio(arquivo);
      elementos.campoFotoUrl.value = '';
      definirFoto(await api.enviarFoto(fotoReduzida));
    } catch (erro) {
      elementos.campoFotoArquivo.value = '';
      tratarErroDoServidor(erro, mostrarErroProduto);
    } finally {
      avisoEnviando.classList.add('oculto');
      botaoSalvar.disabled = false;
    }
  }

  function mostrarErroProduto(mensagem) {
    elementos.erroProduto.textContent = mensagem;
    elementos.erroProduto.classList.remove('oculto');
  }

  /** Lê o formulário e devolve { produto } ou { erro }. */
  function lerFormularioProduto() {
    const nome = elementos.campoNome.value.trim();
    const descricao = elementos.campoDescricao.value.trim();
    const categoria = elementos.campoCategoria.value.trim();
    const preco = lerValorMonetario(elementos.campoPreco.value);
    const tamanhos = [...elementos.caixasTamanhos]
      .filter((caixa) => caixa.checked)
      .map((caixa) => caixa.value);
    const cores = [
      ...new Set(
        elementos.campoCores.value
          .split(',')
          .map((cor) => cor.trim())
          .filter(Boolean),
      ),
    ];

    if (!nome) return { erro: 'Informe o nome do produto.' };
    if (!categoria) return { erro: 'Informe a categoria.' };
    if (!Number.isFinite(preco) || preco <= 0) return { erro: 'Informe um preço válido (ex.: 65,00).' };
    if (tamanhos.length === 0) return { erro: 'Selecione pelo menos um tamanho.' };
    if (cores.length === 0) return { erro: 'Informe pelo menos uma cor.' };

    return {
      produto: {
        // Produto novo vai sem id: o servidor cria o identificador
        id: idProdutoEmEdicao,
        nome,
        descricao,
        categoria,
        preco: Math.round(preco * 100) / 100,
        foto: fotoAtual,
        tamanhos,
        cores,
        ativo: elementos.campoAtivo.checked,
      },
    };
  }

  async function salvarFormularioProduto(evento) {
    evento.preventDefault();
    const resultado = lerFormularioProduto();
    if (resultado.erro) {
      mostrarErroProduto(resultado.erro);
      return;
    }
    const botaoSalvar = elementos.formularioProduto.querySelector('button[type="submit"]');
    botaoSalvar.disabled = true;
    const salvou = await salvarComTratamento(resultado.produto);
    botaoSalvar.disabled = false;
    if (salvou) {
      elementos.janelaProduto.close();
      componentes.mostrarToast(idProdutoEmEdicao ? 'Produto atualizado' : 'Produto cadastrado');
    }
  }

  /** Salva o produto no servidor e atualiza a lista. Retorna true se deu certo. */
  async function salvarComTratamento(produto) {
    try {
      armazenamento.salvarProduto(await api.salvarProduto(produto));
      renderizarProdutos();
      return true;
    } catch (erro) {
      // Com o formulário aberto o erro aparece nele; na lista, só um alerta fica visível
      tratarErroDoServidor(erro, (mensagem) => {
        if (elementos.janelaProduto.open) {
          mostrarErroProduto(mensagem);
        } else {
          alert(mensagem);
        }
      });
      return false;
    }
  }

  // ---------- Contatos do WhatsApp ----------

  /** Desenha uma linha editável (nome + número + liga/desliga + remover) para cada contato salvo. */
  function preencherContatos() {
    const { contatosWhatsApp } = armazenamento.obterConfiguracao();
    elementos.listaContatos.innerHTML = '';
    contatosWhatsApp.forEach(adicionarLinhaContato);
    elementos.erroContatos.classList.add('oculto');
  }

  function adicionarLinhaContato(contato) {
    const idContato = contato.id || contatos.gerarIdContato();
    const idSeguro = escaparHtml(idContato);
    const linha = document.createElement('div');
    linha.className = 'linha-contato-admin';
    linha.dataset.idContato = idContato;
    linha.innerHTML = `
      <div class="campo">
        <label for="${idSeguro}-nome">Nome</label>
        <input type="text" id="${idSeguro}-nome" data-campo="nome" maxlength="40" placeholder="Ex.: Vendas" />
      </div>
      <div class="campo">
        <label for="${idSeguro}-numero">WhatsApp</label>
        <input type="tel" id="${idSeguro}-numero" data-campo="numero" inputmode="tel" placeholder="(21) 99999-9999" />
      </div>
      <label class="interruptor">
        <input type="checkbox" role="switch" data-campo="ativo" />
        <span class="interruptor-trilho" aria-hidden="true"></span>
        <span class="interruptor-texto"></span>
      </label>
      <button class="botao botao-perigo botao-pequeno" type="button" data-acao="remover-contato">Remover</button>`;
    // Valores atribuídos via propriedade: dispensa escapar o texto digitado
    linha.querySelector('[data-campo="nome"]').value = contato.nome || '';
    linha.querySelector('[data-campo="numero"]').value = contato.numero
      ? contatos.formatarTelefone(contato.numero)
      : '';
    const campoAtivo = linha.querySelector('[data-campo="ativo"]');
    campoAtivo.checked = contato.ativo !== false;
    campoAtivo.addEventListener('change', () => atualizarTextoInterruptor(linha));
    atualizarTextoInterruptor(linha);
    elementos.listaContatos.appendChild(linha);
    return linha;
  }

  /** Mostra "Ligado"/"Desligado" ao lado do interruptor e deixa esmaecida a linha do contato desligado. */
  function atualizarTextoInterruptor(linha) {
    const estaLigado = linha.querySelector('[data-campo="ativo"]').checked;
    linha.querySelector('.interruptor-texto').textContent = estaLigado ? 'Ligado' : 'Desligado';
    linha.classList.toggle('contato-desligado', !estaLigado);
  }

  function adicionarContatoVazio() {
    const novaLinha = adicionarLinhaContato({ nome: '', numero: '' });
    novaLinha.querySelector('[data-campo="nome"]').focus();
  }

  function tratarAcaoContato(evento) {
    const botao = evento.target.closest('button[data-acao="remover-contato"]');
    if (!botao) return;
    const linha = botao.closest('.linha-contato-admin');
    const nomeContato = linha.querySelector('[data-campo="nome"]').value.trim() || 'este contato';
    if (!confirm(`Remover ${nomeContato}? A alteração só vale depois de salvar.`)) return;
    linha.remove();
  }

  async function salvarContatos(evento) {
    evento.preventDefault();
    const contatosDigitados = [...elementos.listaContatos.querySelectorAll('.linha-contato-admin')].map(
      (linha) => ({
        id: linha.dataset.idContato,
        nome: linha.querySelector('[data-campo="nome"]').value,
        numero: linha.querySelector('[data-campo="numero"]').value,
        ativo: linha.querySelector('[data-campo="ativo"]').checked,
      }),
    );

    const resultado = contatos.validarContatos(contatosDigitados);
    mostrarErroContatos(resultado.erro || '');
    if (resultado.erro) return;

    const botaoSalvar = evento.target.querySelector('button[type="submit"]');
    botaoSalvar.disabled = true;
    try {
      const contatosSalvos = await api.salvarContatos(resultado.contatos);
      armazenamento.salvarConfiguracao({ contatosWhatsApp: contatosSalvos, origemServidor: true });
      preencherContatos();
      componentes.mostrarToast('Contatos salvos');
    } catch (erro) {
      tratarErroDoServidor(erro, mostrarErroContatos);
    } finally {
      botaoSalvar.disabled = false;
    }
  }

  function mostrarErroContatos(mensagem) {
    elementos.erroContatos.textContent = mensagem;
    elementos.erroContatos.classList.toggle('oculto', !mensagem);
  }

  // ---------- Configurações ----------

  function preencherConfiguracoes() {
    const configuracao = armazenamento.obterConfiguracao();
    document.getElementById('campo-valor-minimo').value = String(configuracao.valorMinimo).replace('.', ',');
    preencherContatos();
  }

  async function salvarConfiguracoes(evento) {
    evento.preventDefault();
    const elementoErro = document.getElementById('erro-configuracao');
    const mostrarErro = (mensagem) => {
      elementoErro.textContent = mensagem;
      elementoErro.classList.toggle('oculto', !mensagem);
    };
    const valorMinimo = lerValorMonetario(document.getElementById('campo-valor-minimo').value || '0');

    if (!Number.isFinite(valorMinimo) || valorMinimo < 0) {
      mostrarErro('Informe um valor mínimo válido (ex.: 300,00).');
      return;
    }
    mostrarErro('');

    const botaoSalvar = evento.target.querySelector('button[type="submit"]');
    botaoSalvar.disabled = true;
    try {
      const valorSalvo = await api.salvarValorMinimo(Math.round(valorMinimo * 100) / 100);
      armazenamento.salvarConfiguracao({ valorMinimo: valorSalvo, origemServidor: true });
      document.getElementById('campo-valor-minimo').value = String(valorSalvo).replace('.', ',');
      componentes.mostrarToast('Configurações salvas');
    } catch (erro) {
      tratarErroDoServidor(erro, mostrarErro);
    } finally {
      botaoSalvar.disabled = false;
    }
  }

  // ---------- Troca de senha ----------

  async function trocarSenha(evento) {
    evento.preventDefault();
    const campoSenhaAtual = document.getElementById('campo-senha-atual');
    const campoNovaSenha = document.getElementById('campo-nova-senha');
    const campoConfirmacao = document.getElementById('campo-confirmar-senha');
    const elementoErro = document.getElementById('erro-senha');
    const mostrarErro = (mensagem) => {
      elementoErro.textContent = mensagem;
      elementoErro.classList.toggle('oculto', !mensagem);
    };

    if (campoNovaSenha.value.length < 10) {
      mostrarErro('A nova senha precisa ter pelo menos 10 caracteres.');
      return;
    }
    if (campoNovaSenha.value !== campoConfirmacao.value) {
      mostrarErro('A nova senha e a repetição não conferem.');
      return;
    }
    mostrarErro('');

    const botaoSalvar = evento.target.querySelector('button[type="submit"]');
    botaoSalvar.disabled = true;
    try {
      await api.trocarSenha(campoSenhaAtual.value, campoNovaSenha.value);
      evento.target.reset();
      componentes.mostrarToast('Senha trocada');
    } catch (erro) {
      tratarErroDoServidor(erro, mostrarErro);
    } finally {
      botaoSalvar.disabled = false;
    }
  }

  // ---------- Cópia de segurança ----------

  function exportarCatalogo() {
    const conteudoArquivo = armazenamento.gerarArquivoDadosIniciais();
    const arquivo = new Blob([conteudoArquivo], { type: 'text/javascript;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(arquivo);
    link.download = 'dados-iniciais.js';
    link.click();
    // Pequeno atraso para o navegador iniciar o download antes de liberar a memória
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    componentes.mostrarToast('Cópia de segurança baixada');
  }

  raiz.Loja.telaAdmin = { iniciar };
})(window);
