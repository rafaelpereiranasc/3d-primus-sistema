// CONEXÃO COM O BANCO DE DADOS LOCAL NA PASTA (VIA NODE.JS)
const API_URL = 'http://localhost:3000/api/data';

let orders = [];
let costItems = [];

const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n)||0);
const today = () => new Date().toISOString().slice(0,10);

function toast(msg){
    let t = $('toast');
    if(!t) return;
    t.textContent = msg;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 2600);
}

function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

function dueInfo(o){
    if(['Finalizado','Entregue','Cancelado'].includes(o.status)) return {text: o.deadline ? new Date(o.deadline+'T12:00:00').toLocaleDateString('pt-BR') : '—', cls:''};
    if(!o.deadline) return {text:'Sem prazo', cls:''};
    let diff = Math.ceil((new Date(o.deadline+'T23:59:59') - new Date()) / 86400000);
    return diff < 0 ? {text:`Atrasado ${Math.abs(diff)} dia(s)`, cls:'deadline-late'} : diff <= 2 ? {text: diff===0 ? 'Hoje' : `Em ${diff} dia(s)`, cls:'deadline-soon'} : {text: new Date(o.deadline+'T12:00:00').toLocaleDateString('pt-BR'), cls:''};
}

function pillProd(s){
    let cls = s==='Finalizado'||s==='Entregue'?'done':s==='Em produção'?'progress':s==='Cancelado'?'late':'wait';
    return `<span class="pill ${cls}">${escapeHtml(s)}</span>`;
}

function pillFin(f){
    let statusFin = f || 'Pendente';
    let cls = statusFin === 'Concluído' ? 'fin-concluido' : statusFin === 'Inconsistente' ? 'fin-inconsistente' : 'wait';
    return `<span class="pill ${cls}">${escapeHtml(statusFin)}</span>`;
}

function mudarAba(page){
    document.querySelectorAll('.page-sec').forEach(el => el.classList.add('hidden'));
    let target = $(page + 'Page');
    if(target) target.classList.remove('hidden');

    document.querySelectorAll('.sidebar .nav').forEach(b => b.classList.remove('active'));
    let btn = $('btn-' + page);
    if(btn) btn.classList.add('active');

    let titles = {
        dashboard:['Visão geral','Acompanhe a produção da sua loja em um só lugar.'],
        orders:['Pedidos','Cadastre, acompanhe e atualize cada produção e status financeiro.'],
        costCalculator:['Custo de Produção','Calculadora e precificação de peças 3D baseada na planilha da loja.'],
        finance:['Financeiro & Custos','Controle de custos de produção, margens e inconsistências.'],
        commissions:['Comissões (7%) & Relatório','Prestação de contas mensal e comissões da equipe.'],
        backup:['Backup e dados','Proteja os registros e mantenha uma cópia fora do navegador.']
    };
    if(titles[page]){
        if($('pageTitle'))$('pageTitle').textContent = titles[page][0];
        if($('pageSub'))$('pageSub').textContent = titles[page][1];
    }
    renderAll();
}

function metric(label,value,hint,dot=''){
    return `<div class="metric"><div class="label"><span class="dot" style="${dot?'background:'+dot:''}"></span>${label}</div><div class="value">${value}</div><div class="hint">${hint}</div></div>`;
}

// CARREGAR DADOS DO ARQUIVO FÍSICO LOCAL
async function loadDataFromLocal(){
    try {
        let response = await fetch(API_URL);
        let data = await response.json();
        if(data.orders) orders = data.orders;
        if(data.costItems) costItems = data.costItems;
        renderAll();
    } catch(e) {
        console.error("Erro ao conectar ao banco local:", e);
        toast('Aviso: Servidor local desligado ou inacessível.');
    }
}

// SALVAR DADOS NO ARQUIVO FÍSICO EM TEMPO REAL
async function saveDataToLocal(){
    try {
        let payload = { orders, costItems };
        await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        renderAll();
    } catch(e) {
        console.error("Erro ao gravar no banco local:", e);
        alert('Erro ao atualizar o arquivo físico na pasta.');
    }
}

// --- CUSTO DE PRODUÇÃO ---
function calculateCostValues(){
    let time = parseFloat($('cTime')?.value) || 0;
    let weight = parseFloat($('cWeight')?.value) || 0;
    let filamentPrice = parseFloat($('cFilamentPrice')?.value) || 130;
    let laborHours = parseFloat($('cLaborHours')?.value) || 0;
    let supplies = parseFloat($('cSupplies')?.value) || 1.35;
    let markup = parseFloat($('cMarkup')?.value) || 3.0;

    let custoMat = (weight * filamentPrice) / 1000;
    let energia = (time / 60) * 0.9 * 0.35;
    let deprec = (5000 / 5000) * (time / 60);
    let custoTotal = supplies + custoMat + energia + deprec + (laborHours * 10);
    let valorFinal = custoTotal * markup;
    let lucroLiq = valorFinal - custoTotal;

    return { custoMat, energia, deprec, custoTotal, valorFinal, lucroLiq };
}

function liveCalc(){
    let res = calculateCostValues();
    if($('previewMaterial'))$('previewMaterial').textContent = money(res.custoMat);
    if($('previewEnergy'))$('previewEnergy').textContent = money(res.energia);
    if($('previewDeprec'))$('previewDeprec').textContent = money(res.deprec);
    if($('previewTotalCost'))$('previewTotalCost').textContent = money(res.custoTotal);
    if($('previewFinalPrice'))$('previewFinalPrice').textContent = money(res.valorFinal);
}

function resetCostForm(){
    if($('costForm'))$('costForm').reset();
    if($('costId'))$('costId').value = '';
    if($('cFilamentPrice'))$('cFilamentPrice').value = '130.00';
    if($('cSupplies'))$('cSupplies').value = '1.35';
    if($('cMarkup'))$('cMarkup').value = '3.0';
    liveCalc();
}

function saveCostItem(e){
    e.preventDefault();
    let id = $('costId')?.value || ('c' + Date.now() + Math.random().toString(16).slice(2,6));
    let res = calculateCostValues();
    let item = {
        id: id,
        name: $('cName')?.value.trim() || 'Peça',
        time: parseFloat($('cTime')?.value) || 0,
        weight: parseFloat($('cWeight')?.value) || 0,
        filamentPrice: parseFloat($('cFilamentPrice')?.value) || 130,
        laborHours: parseFloat($('cLaborHours')?.value) || 0,
        supplies: parseFloat($('cSupplies')?.value) || 1.35,
        markup: parseFloat($('cMarkup')?.value) || 3.0,
        custoMat: res.custoMat,
        energia: res.energia,
        deprec: res.deprec,
        custoTotal: res.custoTotal,
        valorFinal: res.valorFinal,
        lucroLiq: res.lucroLiq
    };

    let idx = costItems.findIndex(x => x.id === id);
    if(idx >= 0) costItems[idx] = item;
    else costItems.push(item);

    saveDataToLocal();
    toast('Custo salvo e arquivo físico atualizado!');
    resetCostForm();
}

function renderCostTable(){
    let q = ($('searchCost')?.value || '').toLowerCase();
    let list = costItems.filter(i => (i.name||'').toLowerCase().includes(q));
    let tbody = $('costRows');
    if(!tbody) return;

    tbody.innerHTML = list.length ? list.map(i => `
        <tr>
            <td><strong>${escapeHtml(i.name)}</strong></td>
            <td>${i.time} min</td>
            <td>${i.weight} g</td>
            <td>${money(i.custoMat)}</td>
            <td><strong>${money(i.custoTotal)}</strong></td>
            <td>${i.markup}x</td>
            <td><strong style="color:var(--green)">${money(i.valorFinal)}</strong></td>
            <td>${money(i.lucroLiq)}</td>
            <td>
                <div class="row-actions">
                    <button type="button" class="mini" onclick="editCostItem('${i.id}')">Editar</button>
                    <button type="button" class="mini danger" onclick="deleteCostItem('${i.id}')">×</button>
                </div>
            </td>
        </tr>
    `).join('') : `<tr><td colspan="9" class="empty">Nenhuma peça cadastrada.</td></tr>`;
}

function editCostItem(id){
    let item = costItems.find(x => x.id === id);
    if(!item) return;
    mudarAba('costCalculator');
    if($('costId'))$('costId').value = item.id;
    if($('cName'))$('cName').value = item.name;
    if($('cTime'))$('cTime').value = item.time;
    if($('cWeight'))$('cWeight').value = item.weight;
    if($('cFilamentPrice'))$('cFilamentPrice').value = item.filamentPrice;
    if($('cLaborHours'))$('cLaborHours').value = item.laborHours;
    if($('cSupplies'))$('cSupplies').value = item.supplies;
    if($('cMarkup'))$('cMarkup').value = item.markup;
    liveCalc();
}

function deleteCostItem(id){
    if(confirm('Excluir este cálculo?')){
        costItems = costItems.filter(x => x.id !== id);
        saveDataToLocal();
        toast('Peça excluída e arquivo atualizado.');
    }
}

// --- RENDERIZAÇÕES GERAIS ---
function renderDashboard(){
    let active = orders.filter(o => !['Finalizado','Entregue','Cancelado'].includes(o.status)),
        late = active.filter(o => o.deadline && o.deadline < today()),
        inconsistentes = orders.filter(o => o.financialStatus === 'Inconsistente');
    let totalCustoAtivo = active.reduce((s,o) => s + (Number(o.cost)||0), 0);

    if($('dashMetrics')) {$('dashMetrics').innerHTML = metric('Em andamento', active.length, 'Pedidos abertos', '#1769aa') +
                                      metric('Atrasados', late.length, 'Precisam de atenção', '#c83c48') +
                                      metric('Inconsistentes', inconsistentes.length, 'Requer revisão', '#dc2626') +
                                      metric('Custo em aberto', money(totalCustoAtivo), 'Custo atual', '#b77908');
    }

    let list = [...active].sort((a,b) => (a.deadline||'9999').localeCompare(b.deadline||'9999')).slice(0,8);
    let tbody = $('dashRows');
    if(tbody) {
        tbody.innerHTML = list.length ? list.map(o => `<tr><td><strong>${escapeHtml(o.product)}</strong><small>${escapeHtml(o.client)} · ${escapeHtml(o.phone||'Sem telefone')}</small></td><td class="${dueInfo(o).cls}">${dueInfo(o).text}</td><td>${pillProd(o.status)}</td><td>${pillFin(o.financialStatus)}</td><td>${escapeHtml(o.responsible)}</td><td><button type="button" class="mini" onclick="editOrder('${o.id}')">Editar</button></td></tr>`).join('') : `<tr><td colspan="6" class="empty">Ainda não há pedidos em andamento.</td></tr>`;
    }
}

function renderOrders(){
    let q = ($('searchOrders')?.value || '').toLowerCase(),
        f = $('filterStatus')?.value || '',
        finF = $('filterFinancial')?.value || '',
        sort = $('sortOrders')?.value || 'deadline';
    let list = orders.filter(o => (!f || o.status === f) && (!finF || o.financialStatus === finF) && [o.client, o.phone, o.product, o.responsible].join(' ').toLowerCase().includes(q));
    list.sort((a,b) => sort==='newest' ? (b.createdAt||'').localeCompare(a.createdAt||'') : (a.deadline||'9999').localeCompare(b.deadline||'9999'));
    
    if($('orderCount'))$('orderCount').textContent = `${list.length} pedido(s)`;
    let tbody = $('orderRows');
    if(tbody) {
        tbody.innerHTML = list.length ? list.map(o => `<tr><td><strong>${escapeHtml(o.product)}</strong><small>${escapeHtml(o.client)} · ${escapeHtml(o.phone||'Sem telefone')}</small></td><td>${o.startDate?new Date(o.startDate+'T12:00:00').toLocaleDateString('pt-BR'):'—'}</td><td class="${dueInfo(o).cls}">${dueInfo(o).text}</td><td>${pillProd(o.status)}</td><td>${pillFin(o.financialStatus)}</td><td>${money(o.total)}</td><td>${money(o.cost)}</td><td><strong style="color:var(--green)">${money((Number(o.total)||0)*0.07)}</strong></td><td>${escapeHtml(o.responsible)}</td><td><div class="row-actions"><button type="button" class="mini" onclick="editOrder('${o.id}')">Editar</button><button type="button" class="mini" title="Concluir Fin." onclick="setFinStatus('${o.id}','Concluído')">✓</button><button type="button" class="mini danger" title="Inconsistente" onclick="setFinStatus('${o.id}','Inconsistente')">!</button></div></td></tr>`).join('') : `<tr><td colspan="10" class="empty">Nenhum pedido encontrado.</td></tr>`;
    }
}

function renderFinance(){
    let valid = orders.filter(o => o.status !== 'Cancelado');
    let totalVendido = valid.reduce((s,o) => s + (+o.total||0), 0);
    let totalCusto = valid.reduce((s,o) => s + (+o.cost||0), 0);
    let totalComissao7 = valid.reduce((s,o) => s + ((+o.total||0)*0.07), 0);
    let lucroBruto = totalVendido - totalCusto - totalComissao7;
    let inconsistentes = valid.filter(o => o.financialStatus === 'Inconsistente');

    if($('financeMetrics')) {$('financeMetrics').innerHTML = metric('Custo Total', money(totalCusto), 'Soma dos custos', '#c83c48') +
                                        metric('Comissão Total (7%)', money(totalComissao7), 'Provisão', '#f28b27') +
                                        metric('Faturamento', money(totalVendido), 'Vendas válidas', '#1769aa') +
                                        metric('Lucro Líquido', money(lucroBruto), 'Líquido estimado', '#16845b');
    }

    if($('financeSummary')) {$('financeSummary').innerHTML = `<div class="moneyline"><span>Total de Pedidos</span><strong>${valid.length}</strong></div><div class="moneyline"><span>Faturamento</span><strong>${money(totalVendido)}</strong></div><div class="moneyline"><span>Custo Total</span><strong style="color:var(--red)">${money(totalCusto)}</strong></div><div class="moneyline"><span>Comissões (7%)</span><strong style="color:var(--orange)">${money(totalComissao7)}</strong></div><div class="moneyline"><span>Inconsistentes</span><strong style="color:var(--red)">${inconsistentes.length}</strong></div>`;
    }

    if($('inconsistentList')) {$('inconsistentList').innerHTML = inconsistentes.length ? inconsistentes.map(o => `<div class="moneyline"><span><strong>${escapeHtml(o.client)}</strong><br><small>${escapeHtml(o.product)} - Resp: ${escapeHtml(o.responsible)}</small></span><button type="button" class="mini danger" onclick="editOrder('${o.id}')">Resolver</button></div>`).join('') : '<div class="empty">Nenhum pedido inconsistente! Tudo em ordem.</div>';
    }
}

function renderCommissions(){
    let month = $('commissionMonth')?.value || today().slice(0,7);
    let list = orders.filter(o => o.financialStatus === 'Concluído' && o.startDate && o.startDate.slice(0,7) === month && o.status !== 'Cancelado');
    let people = {};
    list.forEach(o => {
        let p = o.responsible || 'Outro';
        if(!people[p]) people[p] = {count:0, total:0, cost:0};
        people[p].count++;
        people[p].total += Number(o.total) || 0;
        people[p].cost += Number(o.cost) || 0;
    });
    let totalVendido = list.reduce((s,o) => s + (+o.total||0), 0);
    let totalCusto = list.reduce((s,o) => s + (+o.cost||0), 0);
    let comissaoTotal = totalVendido * 0.07;

    if($('commissionMetrics')) {$('commissionMetrics').innerHTML = metric('Concluídos (Fin.)', list.length, `Mês ${month}`, '#1769aa') +
                                          metric('Produção Apurada', money(totalVendido), 'Base comissão', '#16845b') +
                                          metric('Custo Período', money(totalCusto), 'Custos', '#c83c48') +
                                          metric('Comissão Total (7%)', money(comissaoTotal), 'Soma 7%', '#f28b27');
    }

    if($('commissionRows')) {$('commissionRows').innerHTML = Object.keys(people).length ? Object.entries(people).map(([p,v]) => `<tr><td><strong>${escapeHtml(p)}</strong></td><td>${v.count}</td><td>${money(v.total)}</td><td>${money(v.cost)}</td><td><strong style="color:var(--green)">${money(v.total*0.07)}</strong></td></tr>`).join('') : `<tr><td colspan="5" class="empty">Nenhum pedido concluído neste mês.</td></tr>`;
    }
}

function renderBackup(){
    if($('backupCount'))$('backupCount').textContent = orders.length;
}

function renderAll(){
    renderDashboard();
    renderOrders();
    renderCostTable();
    renderFinance();
    renderCommissions();
    renderBackup();
}

function openOrder(){
    if($('orderForm'))$('orderForm').reset();
    if($('orderId'))$('orderId').value = '';
    if($('modalTitle'))$('modalTitle').textContent = 'Novo pedido';
    if($('startDate'))$('startDate').value = today();
    if($('deadline'))$('deadline').value = today();
    if($('paid'))$('paid').value = '0';
    if($('cost'))$('cost').value = '0.00';
    if($('status'))$('status').value = 'Em produção';
    if($('financialStatus'))$('financialStatus').value = 'Pendente';
    if($('responsible'))$('responsible').value = 'Rafael';
    let modal = $('orderModal');
    if(modal) modal.classList.remove('hidden');
}

function closeModal(){
    let modal = $('orderModal');
    if(modal) modal.classList.add('hidden');
}

function editOrder(id){
    let o = orders.find(x => x.id === id);
    if(!o) return;
    openOrder();
    if($('modalTitle'))$('modalTitle').textContent = 'Editar pedido';
    if($('orderId'))$('orderId').value = o.id;
    ['client','phone','product','startDate','deadline','status','financialStatus','responsible','total','cost','paid','paymentMethod','notes'].forEach(k => {
        if($(k))$(k).value = o[k] ?? '';
    });
}

function saveOrder(e){
    e.preventDefault();
    let id = $('orderId')?.value || ('p' + Date.now() + Math.random().toString(16).slice(2,6));
    let old = orders.find(o => o.id === id);

    let o = {
        id: id,
        client: $('client')?.value.trim() || '',
        phone: $('phone')?.value.trim() || '',
        product: $('product')?.value.trim() || '',
        startDate: $('startDate')?.value || null,
        deadline: $('deadline')?.value || null,
        status: $('status')?.value || 'Em produção',
        financialStatus: $('financialStatus')?.value || 'Pendente',
        responsible: $('responsible')?.value || 'Rafael',
        total: Math.max(0, Number($('total')?.value) || 0),
        cost: Math.max(0, Number($('cost')?.value) || 0),
        paid: Math.max(0, Number($('paid')?.value) || 0),
        paymentMethod: $('paymentMethod')?.value || 'Pix',
        notes: $('notes')?.value || '',
        createdAt: old ? old.createdAt : new Date().toISOString()
    };
    
    let idx = orders.findIndex(x => x.id === id);
    if(idx >= 0) orders[idx] = o;
    else orders.unshift(o);

    saveDataToLocal();
    closeModal();
    toast(old ? 'Pedido atualizado e gravado na pasta!' : 'Pedido cadastrado e gravado na pasta!');
}

function setFinStatus(id, statusFin){
    let o = orders.find(x => x.id === id);
    if(o) {
        o.financialStatus = statusFin;
        saveDataToLocal();
        toast(`Status alterado e gravado!`);
    }
}

function exportBackup(){
    saveDataToLocal();
    toast('Banco de dados local sincronizado.');
}

function clearAll(){
    if(confirm('ATENÇÃO: Deseja apagar TODOS os pedidos e custos do banco local?')){
        orders = [];
        costItems = [];
        saveDataToLocal();
        toast('Banco de dados limpo.');
        renderAll();
    }
}

if($('commissionMonth'))$('commissionMonth').value = today().slice(0,7);

// INICIALIZAR LENDO DO ARQUIVO LOCAL
loadDataFromLocal();
