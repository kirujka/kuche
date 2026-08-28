let FOOD_BUDGET = 180;   // € в месяц на еду — меняется кнопками на вкладке «Правила»
/* ============ генерация недели ============ */
const DAYS=['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
const bySlot = s => R.filter(r=>r.s===s);
const pick = (arr,n)=>{
  const o=[]; let a=[...arr];
  while(o.length<n){
    if(!a.length) a=[...arr];
    if(!a.length) break;
    o.push(a.splice(Math.floor(Math.random()*a.length),1)[0]);
  }
  return o;
};

let week = null;
let checks = {};
let pins = {};   // закреплённые блюда — подгонка бюджета их не трогает

// экономный режим: деньги идут в завтрак, ужин режется.
// доля дешёвого пула, из которого можно выбирать
// Бюджет считается НА НЕДЕЛЮ, а не потолком на блюдо.
// Любой рецепт может попасть в меню — дорогое просто уравновешивается дешёвым.
function poolFor(slot){ return bySlot(slot); }

function weekCost(){
  const need = shoppingList();
  let c = 0;
  Object.entries(need).forEach(([n,q])=>{ c += ING[n].p*(q/ING[n].per); });
  return c;
}

// подгонка под недельный бюджет: меняем случайный дорогой слот на более дешёвый.
// выбор взвешен по цене, поэтому дорогое блюдо иногда выживает — так сохраняется разнообразие.
function fitBudget(){
  fitting = true;
  const target = FOOD_BUDGET/4.33;
  enforceEggRules();          // сперва разнообразие
  // самое дорогое блюдо недели остаётся — режется всё вокруг него
  let hl=null;
  if(!Object.keys(pins).length){
    const cands=[{k:'lu0',c:week.lu[0].c},{k:'lu1',c:week.lu[1].c},
                 {k:'br0',c:week.br[0].c},{k:'br1',c:week.br[1].c},
                 {k:'dn0',c:week.dn[0].c},{k:'so',c:week.so.c}];
    cands.sort((a,b)=>b.c-a.c);
    hl=cands[0].k; pins[hl]=true;
  }
  const slotRefs = () => [
    {arr:week.br, i:0, k:'br0'}, {arr:week.br, i:1, k:'br1'},
    {arr:week.dn, i:0, k:'dn0'}, {arr:week.dn, i:1, k:'dn1'}, {arr:week.dn, i:2, k:'dn2'},
    {arr:week.sn, i:0, k:'sn0'}, {arr:week.sn, i:1, k:'sn1'}, {arr:week.sn, i:2, k:'sn2'},
    {arr:week.lu, i:0, k:'lu0'}, {arr:week.lu, i:1, k:'lu1'},
    {arr:null,    i:0, k:'so'}
  ];
  for(let it=0; it<300; it++){
    const gap = weekCost() - target;
    if(gap <= 0) break;
    const items = slotRefs()
      .filter(r=>!pins[r.k])
      .map(r=>({r, rec: r.arr ? r.arr[r.i] : week.so}));
    if(!items.length) break;
    const weights = items.map(x=>Math.pow(x.rec.c, 3));
    const sum = weights.reduce((a,b)=>a+b,0);
    if(sum<=0) break;
    let roll = Math.random()*sum, idx = 0;
    for(let k=0;k<weights.length;k++){ roll -= weights[k]; if(roll<=0){ idx=k; break; } }
    const chosen = items[idx];
    let cheaper = bySlot(chosen.rec.s).filter(r=>r.c < chosen.rec.c);
    if(!cheaper.length) continue;
    // чем больше перебор, тем решительнее замена
    cheaper.sort((a,b)=>a.c-b.c);
    const take = gap > 4 ? Math.max(1, Math.ceil(cheaper.length*0.4)) : cheaper.length;
    const next = cheaper[Math.floor(Math.random()*take)];
    if(chosen.r.arr) chosen.r.arr[chosen.r.i] = next; else week.so = next;
    // замена не должна ломать правило по яйцам
    if(it % 20 === 19) enforceEggRules();
  }
  enforceEggRules();
  // короткая доводка на случай, если последняя проверка снова подняла цену
  for(let it=0; it<60 && weekCost()>target; it++){
    const items = slotRefs().filter(r=>!pins[r.k])
      .map(r=>({r, rec: r.arr ? r.arr[r.i] : week.so}))
      .sort((a,b)=>b.rec.c-a.rec.c);
    let done=false;
    for(const x of items){
      const cheaper = bySlot(x.rec.s).filter(r=>r.c < x.rec.c)
        .filter(r=>{ // не ломаем правило по яйцам
          if(hasEgg(r)) return true;
          return true;
        });
      if(!cheaper.length) continue;
      cheaper.sort((a,b)=>a.c-b.c);
      const next=cheaper[0];
      if(x.r.arr) x.r.arr[x.r.i]=next; else week.so=next;
      done=true; break;
    }
    if(!done) break;
    enforceEggRules();
  }
  if(hl) delete pins[hl];
  ensureEdamame();
  fitting = false;
}

// правила разнообразия по яйцам применяем после подгонки бюджета
let fitting = false;   // true во время подгонки под бюджет
function enforceEggRules(){
  // в экономном режиме подставляем самое дешёвое из блюд без яиц,
  // иначе замена ломает уже подогнанный бюджет
  const takeNoEgg = slot => {
    const noegg = bySlot(slot).filter(r=>!hasEgg(r));
    if(!noegg.length) return null;
    if(!fitting) return pick(noegg,1)[0];
    const sorted=[...noegg].sort((a,b)=>a.c-b.c);
    return sorted[Math.floor(Math.random()*Math.min(3,sorted.length))];
  };
  if(week.br.every(hasEgg)){
    const r=takeNoEgg('breakfast'); if(r) week.br[Math.floor(Math.random()*2)]=r;
  }
  if(week.dn.every(hasEgg)){
    const r=takeNoEgg('dinner'); if(r) week.dn[Math.floor(Math.random()*3)]=r;
  }
  if(week.sn.every(hasEgg)){
    const r=takeNoEgg('snack'); if(r) week.sn[Math.floor(Math.random()*3)]=r;
  }
}

// эдамаме дорогое и вылетает при подгонке бюджета, поэтому гарантируем
// минимум одно блюдо с ним в неделю
const hasEd = r => r.i.some(([n])=>n==='Эдамаме, зам.');
function ensureEdamame(){
  const all=[...week.br,...week.lu,week.so,...week.dn,...week.sn];
  if(all.some(hasEd)) return;
  const slots=[
    {arr:week.dn, i:Math.floor(Math.random()*3), s:'dinner'},
    {arr:week.lu, i:Math.floor(Math.random()*2), s:'lunch'},
    {arr:week.br, i:Math.floor(Math.random()*2), s:'breakfast'},
    {arr:week.sn, i:Math.floor(Math.random()*3), s:'snack'}
  ].sort(()=>Math.random()-0.5);   // иначе всегда выпадал один и тот же слот
  for(const sl of slots){
    const pool=bySlot(sl.s).filter(hasEd);
    if(!pool.length) continue;
    sl.arr[sl.i]=pool[Math.floor(Math.random()*pool.length)];
    return;
  }
}
const hasEgg = r => r.i.some(([n])=>n==='Яйца');

// из двух завтраков хотя бы один должен быть без яиц
function pickBreakfasts(){
  const pool = poolFor('breakfast');
  const noegg = pool.filter(r=>!hasEgg(r));
  if(!noegg.length) return pick(pool,2);
  const first = pick(noegg,1)[0];
  const rest = pool.filter(r=>r.id!==first.id);
  const second = pick(rest,1)[0];
  return Math.random()<0.5 ? [first,second] : [second,first];
}
// из трёх ужинов яичных не больше двух
function pickDinners(){
  const pool = poolFor('dinner');
  let out = pick(pool,3);
  const noegg = pool.filter(r=>!hasEgg(r));
  if(out.filter(hasEgg).length===3 && noegg.length){
    const swap = pick(noegg,1)[0];
    out[Math.floor(Math.random()*3)] = swap;
  }
  return out;
}
function buildWeek(keep){
  const br = keep?keep.br:pickBreakfasts();
  const dn = keep?keep.dn:pickDinners();
  const sn = keep?keep.sn:(function(){
    const pool=poolFor('snack'); let out=pick(pool,3);
    const noegg=pool.filter(r=>!hasEgg(r));
    if(!out.some(r=>!hasEgg(r)) && noegg.length) out[Math.floor(Math.random()*3)]=pick(noegg,1)[0];
    return out;
  })();
  const lunches = pick(poolFor('lunch'),2);
  const soup = pick(poolFor('soup'),1)[0];
  return {br,dn,sn,lu:lunches,so:soup};
}
// какой обед в какой день + где готовим
const LUNCH_MAP = [
  {src:'lu0',cook:true},   // Пн — противень A
  {src:'lu0',cook:false},  // Вт
  {src:'lu0',cook:false},  // Ср
  {src:'so', cook:true},   // Чт — кастрюля
  {src:'so', cook:false},  // Пт
  {src:'lu1',cook:true},   // Сб — противень B
  {src:'lu1',cook:false}   // Вс
];
function lunchOf(d){
  const m=LUNCH_MAP[d];
  return m.src==='so' ? week.so : week.lu[+m.src.slice(2)];
}
function dayPlan(d){
  return [
    {lab:'Завтрак', r:week.br[d%2], left:false},
    {lab:'Обед',    r:lunchOf(d),   left:!LUNCH_MAP[d].cook},
    {lab:'Перекус', r:week.sn[d%3], left:false},
    {lab:'Ужин',    r:week.dn[d%3], left:false}
  ];
}

/* ============ рендер: неделя ============ */
function slotKey(d,si){
  if(si===0) return 'br'+(d%2);
  if(si===2) return 'sn'+(d%3);
  if(si===3) return 'dn'+(d%3);
  const m=LUNCH_MAP[d];
  return m.src==='so' ? 'so' : 'lu'+m.src.slice(2);
}
function weekTotals(){
  let k=0,p=0,c=0;
  for(let d=0; d<7; d++){
    dayPlan(d).forEach(s=>{ k+=s.r.k; p+=s.r.p; });
  }
  const need=shoppingList();
  Object.entries(need).forEach(([n,q])=>{ c += ING[n].p*(q/ING[n].per); });
  return {k:Math.round(k/7), p:Math.round(p/7), c};
}
function renderHeader(){
  const t=weekTotals();
  document.getElementById('tKcal').textContent = t.k+' ккал';
  document.getElementById('tProt').textContent = t.p+' г';
  const el=document.getElementById('tBud');
  el.textContent = t.c.toFixed(0)+' € / нед';
  el.style.color = t.c>FOOD_BUDGET/4.33 ? '#E58A6B' : '#8FBFA8';
  const m=document.getElementById('tMonth');
  if(m) m.textContent = Math.round(t.c*4.33)+' €';
  const over = t.c > FOOD_BUDGET/4.33;
  const btn=document.getElementById('thrift');
  if(btn){ btn.className = over ? 'btn green' : 'btn ghost'; }
}
function renderWeek(){
  renderHeader();
  const host=document.getElementById('days');
  host.innerHTML='';
  DAYS.forEach((dn,d)=>{
    const plan=dayPlan(d);
    const k=plan.reduce((a,x)=>a+x.r.k,0);
    const p=plan.reduce((a,x)=>a+x.r.p,0);
    const cookNote = LUNCH_MAP[d].cook ? (LUNCH_MAP[d].src==='so'?'варим суп':'противень') : '';
    const el=document.createElement('div');
    el.className='day';
    el.innerHTML=`
      <div class="day-head">
        <span class="dn">${dn}</span>
        ${cookNote?`<span class="cook">${cookNote}</span>`:''}
        <span class="sum">${k} ккал · ${p} г белка</span>
      </div>
      ${plan.map((s,si)=>`
        <div class="slot ${s.left?'left':''}">
          <div class="lab">${s.lab}</div>
          <div class="body">
            <button class="nm" data-open="${s.r.id}">
              <span class="chip ${METHOD[s.r.m].c}">${METHOD[s.r.m].n}</span>${s.r.n}
            </button>
            <div class="meta">${s.r.k} ккал · ${s.r.p} г белка · ${s.r.c.toFixed(2)} € · ${s.r.t} мин${s.left?' · разогрев':''}</div>
          </div>
          <button class="pin ${pins[slotKey(d,si)]?'on':''}" data-pin="${slotKey(d,si)}" title="Закрепить">${pins[slotKey(d,si)]?'●':'○'}</button>
          <button class="swap" data-swap="${d}:${si}" title="Другое блюдо">⇄</button>
        </div>`).join('')}`;
    host.appendChild(el);
  });
}

/* ============ рендер: список покупок ============ */
function shoppingList(){
  const need={};
  for(let d=0; d<7; d++){
    dayPlan(d).forEach(s=>{
      s.r.i.forEach(([n,q])=>{ need[n]=(need[n]||0)+q; });
    });
  }
  return need;
}
function renderShop(){
  const need=shoppingList();
  const groups={}; const stapleList=[];
  let perish=0, stapleCost=0, consume=0;

  Object.entries(need).forEach(([n,q])=>{
    const g=ING[n];
    let buyQty, label, packCost;
    if(g.u==='шт'||g.u==='банка'){
      buyQty=Math.ceil(q);
      label=`${buyQty} ${g.u}`;
      packCost=g.p*buyQty;
    } else {
      const packs=Math.ceil(q/g.pack);
      buyQty=packs*g.pack;
      label = packs>1 ? `${packs} × ${g.pack} ${g.u}` : `${g.pack} ${g.u}`;
      if(g.pack>=1000 && g.u==='г') label = packs>1?`${packs} × ${g.pack/1000} кг`:`${g.pack/1000} кг`;
      packCost=g.p*(buyQty/g.per);
    }
    consume += g.p*(q/g.per);
    const row={n,label,need:Math.round(q),u:g.u==='банка'?'шт':g.u,price:packCost};
    if(g.staple){ stapleList.push(row); stapleCost+=packCost; }
    else { (groups[g.cat]=groups[g.cat]||[]).push(row); perish+=packCost; }
  });

  const order=['Мясо и рыба','Яйца и сыр','Овощи','Заморозка','Крупы и хлеб','Бакалея'];
  const budget=FOOD_BUDGET/4.33;
  const row = (cat,it)=>{
    const key=cat+'|'+it.n, on=checks[key]?'done':'';
    return `<div class="ritem ${on}" data-chk="${key}">
      <div class="bx">${checks[key]?'✕':''}</div>
      <div class="tx">${it.n}<br><span class="qty">взять ${it.label} · нужно ~${it.need} ${it.u}</span></div>
      <div class="pr">${it.price.toFixed(2)}</div></div>`;
  };

  let html=`<h3>Список на неделю</h3>`;
  order.forEach(cat=>{
    if(!groups[cat])return;
    html+=`<div class="rgroup"><div class="gh">${cat}</div>`;
    groups[cat].sort((a,b)=>b.price-a.price).forEach(it=>{ html+=row(cat,it); });
    html+=`</div>`;
  });

  if(stapleList.length){
    html+=`<div class="rgroup"><div class="gh">Запас — проверь, кончилось ли</div>`;
    stapleList.sort((a,b)=>b.price-a.price).forEach(it=>{ html+=row('Запас',it); });
    html+=`</div>`;
  }

  const over = consume>budget;
  html+=`
    <div class="rline"><span>Скоропорт, обязательно</span><span>${perish.toFixed(2)} €</span></div>
    <div class="rline"><span>Запас, если кончился</span><span>${stapleCost.toFixed(2)} €</span></div>
    <div class="rtotal"><span>Чек, если брать всё</span><span>${(perish+stapleCost).toFixed(2)} €</span></div>
    <div class="rbudget ${over?'over':''}">
      <span>Съедается за неделю</span>
      <span>${consume.toFixed(2)} € из ${budget.toFixed(0)} € · ${over?'перебор '+(consume-budget).toFixed(2):'запас '+(budget-consume).toFixed(2)} €</span>
    </div>
    <div class="rfoot">Крупы, масло, майонез и горчица берутся раз в 3–4 недели.<br>
    В обычную неделю платишь только за скоропорт.<br>
    Если перебор: лосось → минтай, куриное филе → бёдра.</div>`;
  document.getElementById('receipt').innerHTML=html;
}

/* ============ рендер: каталог ============ */
let filter='all';
const FILTERS=[['all','Все'],['breakfast','Завтраки'],['lunch','Обеды'],['soup','Супы'],['dinner','Ужины'],['snack','Перекусы'],['school','В школу'],['noegg','Без яиц'],['prep','Заготовки'],['air','Аэрогриль'],['raw','Без огня']];
function renderCat(){
  const fh=document.getElementById('filters');
  fh.innerHTML=FILTERS.map(([k,l])=>`<button data-f="${k}" aria-pressed="${filter===k}">${l}</button>`).join('');
  const list=R.filter(r=>{
    if(filter==='all') return true;
    if(filter==='school') return r.sc;
    if(filter==='noegg') return !r.i.some(([n])=>n==='Яйца');
    return r.s===filter || r.m===filter;
  });
  document.getElementById('catalog').innerHTML=list.map(r=>`
    <button class="rcard" data-open="${r.id}">
      <div class="nm"><span class="chip ${METHOD[r.m].c}">${METHOD[r.m].n}</span>${r.n}</div>
      <div class="meta">${r.k} ккал · ${r.p} г белка · ${r.c.toFixed(2)} € · ${r.t} мин${r.batch>1?' · готовится на '+r.batch:''}</div>
    </button>`).join('');
}


/* ============ рендер: идеи (без бюджета / уценка) ============ */
let ideaMode='lux';
let luxSlot='Завтрак';
let findFilter='all';
const FIND_TAGS=[['all','Все'],['рыба','Рыба'],['мясо','Мясо'],['овощи','Овощи'],['молочка','Сыр'],['бакалея','Бакалея']];

function renderIdeas(){
  document.querySelectorAll('[data-mode]').forEach(b=>
    b.setAttribute('aria-pressed', b.dataset.mode===ideaMode));
  const intro = {
    lux:'Как это выглядит, когда деньги не вопрос. У каждого блюда — <b>бюджетный двойник</b>: то же по смыслу, но по твоим деньгам.',
    find:'Для вечерних уценок. Нашёл что-то хорошее по скидке — смотри, что с этим сделать.',
    build:'Пять слотов, 42 000 сочетаний. Меняешь любой — получаешь другое блюдо. Внизу считаются калории, белок и цена.'
  };
  document.getElementById('ideaIntro').innerHTML = intro[ideaMode];
  document.getElementById('buildBox').style.display = ideaMode==='build' ? 'block' : 'none';
  document.getElementById('ideaFilters').style.display = ideaMode==='build' ? 'none' : 'flex';
  document.getElementById('ideaList').style.display = ideaMode==='build' ? 'none' : 'block';
  if(ideaMode==='build'){ renderBuilder(); return; }

  const fh=document.getElementById('ideaFilters');
  if(ideaMode==='lux'){
    const slots=['Завтрак','Обед','Ужин','Замены'];
    fh.innerHTML=slots.map(s=>`<button data-ls="${s}" aria-pressed="${luxSlot===s}">${s}</button>`).join('');
    if(luxSlot==='Замены'){
      document.getElementById('ideaList').innerHTML=SWAP.map(x=>`
        <details class="find">
          <summary><span class="fn">${x.n}</span><span class="fde">${x.pr}</span></summary>
          <div class="fbody">
            <div class="ftwin"><span class="tl">Чем заменить</span>${x.cheap}</div>
            <div class="fidea"><span class="ft">Почему</span><span class="fd">${x.w}</span></div>
          </div>
        </details>`).join('');
      return;
    }
    const list=LUX.filter(x=>x.sl===luxSlot);
    document.getElementById('ideaList').innerHTML=list.map(x=>`
      <details class="find">
        <summary>
          <span class="fn">${x.n}</span>
          <span class="fde">${x.de} · ${x.pr}</span>
        </summary>
        <div class="fbody">
          <div class="fidea"><span class="ft">Что это</span><span class="fd">${x.d}</span></div>
          <div class="fidea"><span class="ft">Суть</span><span class="fd">${x.why}</span></div>
          <div class="ftwin"><span class="tl">Бюджетный двойник</span>${x.cheap}</div>
          ${x.warn?`<div class="fnote">${x.warn}</div>`:''}
        </div>
      </details>`).join('');
  } else {
    fh.innerHTML=FIND_TAGS.map(([k,l])=>`<button data-ff="${k}" aria-pressed="${findFilter===k}">${l}</button>`).join('');
    const list=FINDS.filter(f=> findFilter==='all' || f.tag===findFilter);
    document.getElementById('ideaList').innerHTML=list.map(f=>`
      <details class="find">
        <summary>
          <span class="fn">${f.n}</span>
          <span class="fde">${f.de}</span>
        </summary>
        <div class="fbody">
          ${f.ideas.map(i=>`<div class="fidea"><span class="ft">${i.t}</span><span class="fd">${i.d}</span></div>`).join('')}
          ${f.note?`<div class="fnote">${f.note}</div>`:''}
        </div>
      </details>`).join('');
  }
}


/* ============ рендер: конструктор блюда ============ */
const SLOT_META=[
 ['protein','Белок',       'обязателен — без него это не приём пищи, а перекус'],
 ['grain',  'Гарнир',      'добавка, а не основа тарелки'],
 ['veg',    'Овощ',        'из заморозки, приготовлен впрок'],
 ['soft',   'Мягкий элемент','против сухого куска мяса — это роль яйца'],
 ['sauce',  'Заправка',    'бесплатное разнообразие']
];
let build={protein:0,grain:0,veg:0,soft:0,sauce:0};

function renderBuilder(){
  const host=document.getElementById('buildBox');
  if(!host) return;
  const pick=k=>BUILD[k][build[k]];
  const sum=['protein','grain','veg','soft'].reduce((a,k)=>{
    const x=pick(k); return {k:a.k+x.k, p:a.p+x.p, c:a.c+x.c};
  },{k:0,p:0,c:0});

  host.innerHTML = SLOT_META.map(([key,label,hint])=>`
    <div class="bslot">
      <div class="bhead"><span class="bl">${label}</span><span class="bhint">${hint}</span></div>
      <div class="bchips">
        ${BUILD[key].map((o,i)=>`<button data-b="${key}:${i}" aria-pressed="${build[key]===i}">${o.n}</button>`).join('')}
      </div>
    </div>`).join('') + `
    <div class="bresult">
      <div class="brtitle">Твоя тарелка</div>
      <div class="brnums">${sum.k} ккал · ${sum.p} г белка · ${sum.c.toFixed(2)} €</div>
      <div class="brsteps">
        ${['protein','grain','veg','soft'].map(k=>{
          const x=pick(k);
          if(!x.how) return '';
          return `<div class="brstep"><b>${x.n}${x.q&&x.q!=='—'?', '+x.q:''}</b> — ${x.how}</div>`;
        }).join('')}
        <div class="brstep"><b>${pick('sauce').n}</b> — ${pick('sauce').how}</div>
      </div>
      ${['protein','veg','soft'].map(k=>pick(k).warn?`<div class="fnote">${pick(k).warn}</div>`:'').join('')}
      ${sum.p<25?`<div class="fnote">Белка маловато для основного приёма пищи — добавь второй белковый элемент или возьми порцию больше.</div>`:''}
    </div>
    <button class="btn ghost bdice" id="bdice">Случайное сочетание</button>`;
}


/* ============ рендер: тарелка — справочник групп ============ */
let plateMode='groups';
function renderPlate(){
  const host=document.getElementById('plateBox');
  if(!host) return;
  document.querySelectorAll('[data-pm]').forEach(b=>b.setAttribute('aria-pressed', b.dataset.pm===plateMode));
  if(plateMode==='rank'){ renderRank(); return; }
  host.innerHTML = `
  <p class="note">Смотришь, что лежит в холодильнике, находишь это в первой таблице, потом смотришь во второй, к какому приёму пищи оно подходит и в какой пропорции.</p>

  <div class="fact"><h3>Таблица 1 — какая это группа</h3>
    <div class="gr">
      <div class="grh gp">БЕЛОК — основа тарелки</div>
      <div class="grb">Мясо любое · фарш · булеты и фрикадельки · шницель · ветчина · индейка нарезкой · <b>вся рыба, включая красную</b> · тунец и скумбрия из банки · матьес · <b>мидии</b> · яйца · твёрдый сыр (гауда, эмменталь) · творог Twaróg · Harzer
      <div class="grn">Красная рыба — это белок, а не «деликатес отдельно». Мидии тоже белок, причём самый лёгкий: 24 г белка при 4 г жира.</div></div>
    </div>
    <div class="gr">
      <div class="grh gc">УГЛЕВОДЫ — гарнир, самая маленькая часть</div>
      <div class="grb">Гречка · рис · кус-кус · полента · макароны · <b>картофель</b> · хлеб · тортилья · тесто фило и слоёное · драники · круассан · булки · шоколад · печенье · сок · мёд · бананы
      <div class="grn">Главное, что путают: <b>картофель — это углевод, а не овощ.</b> И хлеб с кашей — это тот же сахар, просто медленнее. Сладкое сюда же, отдельной группы «десерт» не существует.</div></div>
    </div>
    <div class="gr">
      <div class="grh gv">ОВОЩИ — объём и клетчатка, почти не считаются</div>
      <div class="grb">Огурец · перец · черри · редис · морковь · цукини · стручковая фасоль · зелёная спаржа · брокколи · горошек · салат · лук-порей · маринованные огурцы · овощная смесь из заморозки
      <div class="grn">Их можно есть почти без счёта. Ограничения только по вздутию: брокколи до 100 г, горошек до 80 г.</div></div>
    </div>
    <div class="gr">
      <div class="grh gf">ЖИРЫ — считать ложками</div>
      <div class="grb">Оливковое масло · майонез · авокадо · <b>орехи и семечки</b> · сливки · сливочное масло · хумус (частично) · тахини
      <div class="grn">Орехи — это НЕ белок, это жир. В них 600 ккал на 100 г. Горсть орехов = треть ужина по калориям.</div></div>
    </div>
    <div class="gr">
      <div class="grh gm">СМЕШАННЫЕ — белок плюс углевод сразу</div>
      <div class="grb">Эдамаме · фасоль в банке · нут и хумус · горох · чечевица
      <div class="grn">Эдамаме — 11 г белка на 100 г, это лучший овощ по белку. Но он и углевод тоже, так что гарнира к нему нужно меньше. Порция до 90 г.</div></div>
    </div>
  </div>

  <div class="fact"><h3>Быстрые ответы на частые вопросы</h3>
    <table>
      <tr><td>Каша + красная рыба</td><td>Полноценно. Не хватает овоща</td></tr>
      <tr><td>Гречка и красная рыба — одна группа?</td><td>Разные. Гречка углевод, рыба белок</td></tr>
      <tr><td>Красная рыба + хлеб</td><td>Полноценно, добавь огурец</td></tr>
      <tr><td>Картофель + овощи, без мяса</td><td>Нет белка. Это гарнир, а не еда</td></tr>
      <tr><td>Каша + котлета + овощи</td><td>Идеально. Все три группы</td></tr>
      <tr><td>Только мясо и овощи, без гарнира</td><td>Отличный ужин</td></tr>
      <tr><td>Орехи вместо мяса</td><td>Нет. Орехи — жир, белка там мало</td></tr>
      <tr><td>Эдамаме вместо мяса</td><td>Частично. 90 г дают 10 г белка — этого мало, добавь ещё белок</td></tr>
      <tr><td>Два углевода сразу (картошка и хлеб)</td><td>Нет. Один гарнир на тарелку</td></tr>
    </table>
  </div>

  <div class="fact"><h3>Таблица 2 — что важно в какой приём</h3>

    <div class="meal">
      <div class="mh">ЗАВТРАК <span>главный приём, на нём не экономим</span></div>
      <div class="mgoal">Задача: не допустить провал сахара к концу первого урока.</div>
      <div class="mplate"><span class="pp" style="flex:50">50% белок</span><span class="pv" style="flex:25">25% овощ</span><span class="pc" style="flex:25">25% гарнир</span></div>
      <ul>
        <li><b>Белок:</b> шницель, фрикадельки, фарш из заготовки, тунец, скумбрия, матьес, красная рыба, сыр, ветчина</li>
        <li><b>Овощ:</b> огурец, перец, черри, эдамаме, брокколи, спаржа, фасоль</li>
        <li><b>Гарнир — максимум:</b> 70 г крупы сухой (4 ложки с горкой) ИЛИ 1 ломтик хлеба. Не оба</li>
        <li>Порядок: сначала белок и овощ, гарнир в конце</li>
        <li>Есть за час до выхода. Кофе после еды, не до</li>
      </ul>
      <div class="mex">Готовые примеры: брускетта с красной рыбой + 2 яйца + огурец · шницель + печёный перец + 4 ложки гречки · тунец + кус-кус 55 г + черри · фарш из заготовки + гречка + перец</div>
    </div>

    <div class="meal">
      <div class="mh">ПЕРЕКУС В ШКОЛУ <span>15 минут, портативно</span></div>
      <div class="mgoal">Задача: продержаться второй урок, не поймав второй провал. Поэтому не чистый сахар.</div>
      <div class="mplate"><span class="pp" style="flex:60">60% белок</span><span class="pc" style="flex:40">40% гарнир</span></div>
      <ul>
        <li>Сэндвич: хлеб + сыр, или ветчина, или скумбрия, или индейка</li>
        <li>Ролл в тортилье — держит форму в сумке лучше и не крошится</li>
        <li>Заворачивать в Backpapier: держишь за бумагу, руками еды не касаешься</li>
        <li><b>Сначала съесть, потом пить кофе.</b> Кофе на пустой желудок сам создаёт ощущение голода</li>
        <li>Круассан и батончик — только как аварийный вариант, они дадут провал ко второму уроку</li>
      </ul>
      <div class="mex">Готовые примеры: сэндвич с сыром и яйцом 0,82 € · ролл с ветчиной и сыром · сэндвич со скумбрией и огурцом</div>
    </div>

    <div class="meal">
      <div class="mh">ОБЕД <span>самый объёмный приём</span></div>
      <div class="mgoal">Задача: наесться надолго. Здесь единственный раз за день гарнир может быть полноценным.</div>
      <div class="mplate"><span class="pp" style="flex:35">35% белок</span><span class="pv" style="flex:30">30% овощ</span><span class="pc" style="flex:35">35% гарнир</span></div>
      <ul>
        <li><b>Гарнир:</b> печёный картофель 250 г (два кулака) — из заготовки, разогрев 6–8 минут при 180°C</li>
        <li><b>Белок:</b> ладонь без пальцев — шницель, фрикадельки, фарш, рыба, мидии</li>
        <li><b>Овощ:</b> две горсти из заморозки, в ту же корзину</li>
        <li>Жирное (скумбрия, драники, слоёное тесто, утка) — только сюда, не на ужин</li>
        <li>Порядок тот же: белок и овощ первыми, картошка последней</li>
      </ul>
      <div class="mex">Готовые примеры: картофель + шницель + фасоль · картофель + фрикадельки + эдамаме · картофель + скумбрия + маринованные огурцы · холодный картофель + тунец + черри</div>
    </div>

    <div class="meal">
      <div class="mh">УЖИН <span>здесь экономим</span></div>
      <div class="mgoal">Задача: не нагружать переносимость жирного на ночь и не давать лишних углеводов перед сном.</div>
      <div class="mplate"><span class="pp" style="flex:50">50% белок</span><span class="pv" style="flex:50">50% овощ</span></div>
      <ul>
        <li><b>Гарнира нет.</b> Ни картошки, ни риса, ни макарон. Максимум один ломтик хлеба</li>
        <li><b>Белок:</b> ладонь. Лучше нежирный — тунец, мидии, минтай, индейка, курица</li>
        <li><b>Овощ:</b> две полные горсти, любые</li>
        <li>Жирное на ночь не ставить: скумбрия, драники, авокадо целиком, слоёное тесто</li>
      </ul>
      <div class="mex">Готовые примеры: брускетта с красной рыбой + огурец · салат с тунцом · фарш с фасолью и сыром · мидии со спаржей · печёная морковь с сыром · омлет с фасолью</div>
    </div>
  </div>

  <div class="fact"><h3>Правило на все случаи</h3>
    <ul>
      <li><b>Белок есть всегда.</b> Нет белка — это перекус, а не приём пищи.</li>
      <li><b>Гарнир один.</b> Картошка или хлеб или каша, не два сразу.</li>
      <li><b>Овощ желательно всегда,</b> и его можно не считать.</li>
      <li><b>Жир меряется ложкой,</b> а не наливается.</li>
      <li><b>Чем позже день, тем меньше гарнира.</b> Утром 25%, в обед 35%, вечером ноль.</li>
    </ul>
  </div>`;
}


/* ============ рендер: рейтинг продуктов ============ */
function renderRank(){
  const host=document.getElementById('plateBox');
  host.innerHTML = `
  <p class="note">Порядок — от лучшего к худшему лично для тебя: похудение, переносимость, цена. Продукты из чёрного списка сюда не входят вообще.</p>
  ` + RANK.map(g=>`
    <div class="fact"><h3>${g.cat}</h3>
      <ol class="rank">
        ${g.items.map(it=>`<li><b>${it.n}</b><div class="rw">${it.w}</div></li>`).join('')}
      </ol>
    </div>`).join('');
}

/* ============ модалка рецепта ============ */
function openRecipe(id){
  const r=R.find(x=>x.id===id); if(!r)return;
  const fmt=(n,q)=>{
    const g=ING[n];
    if(g.u==='шт'||g.u==='банка') return (q%1?q.toFixed(2).replace(/0$/,''):q)+' '+g.u;
    return Math.round(q)+' '+g.u;
  };
  document.getElementById('sheet').innerHTML=`
    <button class="close" id="closeSheet" aria-label="Закрыть">×</button>
    <h2>${r.n}</h2>
    <div class="meta"><span class="chip ${METHOD[r.m].c}">${METHOD[r.m].n}</span>
      ${r.k} ккал · ${r.p} г белка · ${r.c.toFixed(2)} € · ${r.t} мин${r.batch>1?' · порций за раз: '+r.batch:''}</div>
    <h4>На одну порцию</h4>
    ${r.i.map(([n,q])=>`<div class="ing"><span>${n}</span><span>${fmt(n,q)}</span></div>`).join('')}
    ${r.batch>1?`<h4>На ${r.batch} порции — умножь всё на ${r.batch}</h4>
      ${r.i.map(([n,q])=>`<div class="ing"><span>${n}</span><span>${fmt(n,q*r.batch)}</span></div>`).join('')}`:''}
    <h4>Как готовить</h4>
    <ol>${r.st.map(s=>`<li>${s}</li>`).join('')}</ol>
    ${r.tip?`<div class="tip">${r.tip}</div>`:''}
    ${r.warn?`<div class="warn">${r.warn}</div>`:''}`;
  document.getElementById('mask').classList.add('on');
}
function closeSheet(){document.getElementById('mask').classList.remove('on');}

/* ============ страница правил ============ */
function renderInfo(){
  document.getElementById('p-info').innerHTML=`
  <div class="fact"><h3>Цели на день</h3>
    <table>
      <tr><td>Калории</td><td>1800 ккал</td></tr>
      <tr><td>Белок — не ниже</td><td>115 г</td></tr>
      <tr><td>Приёмов пищи</td><td>4, по часам</td></tr>
      <tr><td>Ожидаемая потеря</td><td>0,4–0,5 кг / нед</td></tr>
      <tr><td>Взвешивание</td><td>1 раз в неделю, утром</td></tr>
      <tr><td>Прогноз по еде за месяц</td><td id="tMonth">— €</td></tr>
    </table>
  </div>

  <div class="fact"><h3>Бюджет — ориентир, а не решётка</h3>
    <div class="budgetctl">
      <button data-budget="-10">−10</button>
      <span class="bv">${FOOD_BUDGET} € / мес</span>
      <button data-budget="10">+10</button>
    </div>
    <ul>
      <li>Меню собирается <b>из всех рецептов без ограничений</b>. Бюджет только показывается — цифра в шапке становится зелёной, если укладываешься, и оранжевой, если нет.</li>
      <li>Кнопка <b>«Уложить в бюджет»</b> на вкладке «Неделя» пересобирает текущее меню под сумму. Самое дорогое блюдо при этом остаётся — режется всё вокруг него.</li>
      <li>Кружок ○ у блюда закрепляет его. Закреплённое подгонка не трогает.</li>
      <li>Ориентиры по прогону 2000 недель: свободное меню — <b>241 €/мес</b>, все 72 рецепта в ротации. После подгонки под 180 — <b>181 €/мес</b>, 71 рецепт. При бюджете 226 (месяц с дополнительный доход) — <b>219 €/мес</b> и снова все 72.</li>
      <li>дополнительный доход от школы приходит неровно — в месяц, когда он пришёл, просто подними бюджет кнопкой и собери неделю щедрее.</li>
    </ul>
  </div>

  <div class="fact"><h3>Бюджет месяца</h3>
    <ul><li>Личные суммы в этой сборке не хранятся. Бюджет задаётся кнопками выше и сохраняется только на твоём устройстве.</li></ul>
  </div>

  <div class="fact"><h3>Закупка на месяц — что берётся сразу</h3>
    <p style="font-size:13.5px;margin:0 0 8px;color:var(--muted)">Долгохранящееся. Берётся один раз в начале месяца, дальше в супермаркет ходишь только за скоропортом.</p>
    <table>
      <tr><td>Гречка 500 г</td><td>2,00 €</td></tr>
      <tr><td>Кус-кус 500 г</td><td>1,40 €</td></tr>
      <tr><td>Полента 500 г</td><td>1,25 €</td></tr>
      <tr><td>Рис 1 кг</td><td>2,00 €</td></tr>
      <tr><td>Макароны 500 г × 2</td><td>1,60 €</td></tr>
      <tr><td>Вермишель 500 г</td><td>1,00 €</td></tr>
      <tr><td>Панировочные сухари 400 г</td><td>1,00 €</td></tr>
      <tr><td>Оливковое масло 500 мл</td><td>4,50 €</td></tr>
      <tr><td>Майонез 250 мл</td><td>1,20 €</td></tr>
      <tr><td>Горчица 200 г</td><td>1,00 €</td></tr>
      <tr><td>Томатная паста 200 г</td><td>1,10 €</td></tr>
      <tr><td>Бульонные кубики, упаковка</td><td>0,60 €</td></tr>
      <tr><td>Тунец × 4 банки</td><td>5,60 €</td></tr>
      <tr><td>Скумбрия × 4 банки</td><td>5,20 €</td></tr>
      <tr><td>Огурцы маринованные, банка</td><td>2,30 €</td></tr>
      <tr><td>Фасоль стручковая зам. 750 г × 2</td><td>3,20 €</td></tr>
      <tr><td>Спаржа зелёная зам. 300 г × 2</td><td>3,30 €</td></tr>
      <tr><td>Шпинат зам. 450 г × 2</td><td>2,00 €</td></tr>
      <tr><td>Эдамаме зам. 500 г</td><td>3,00 €</td></tr>
      <tr><td>Овощная смесь зам. 750 г</td><td>1,65 €</td></tr>
      <tr><td>Курица 1 кг × 2 (в морозилку)</td><td>12,00 €</td></tr>
      <tr><td>Фарш индейки 500 г × 2 (в морозилку)</td><td>7,00 €</td></tr>
      <tr><td>Специи, раз в 3 месяца</td><td>4,00 €</td></tr>
      <tr><td><b>Итого разовая закупка</b></td><td><b>~68 €</b></td></tr>
    </table>
    <ul>
      <li>Специи покупаются раз в три месяца, не каждый месяц. Без них: паприка молотая, орегано, куркума, чёрный перец, соль.</li>
      <li>Пергамент (Backpapier) — 1 €, хватает надолго. Без него аэрогриль придётся мыть.</li>
      <li>Остальные ~115 € уходят на скоропорт: яйца, сыр, хлеб, овощи, свежая рыба и мясо. Это 4 захода по ~29 € в неделю.</li>
      <li>Молочку немцы берут на месяц, тебе это не подходит и не нужно — сыр берётся куском раз в неделю.</li>
    </ul>
  </div>

  <div class="fact"><h3>Овощи заранее: из заморозки в аэрогриль</h3>
    <p style="font-size:13.5px;margin:0 0 8px;color:var(--muted)">Ничего размораживать не надо. Пергамент, ложка масла, соль. Один заход — на 3–4 дня.</p>
    <table>
      <tr><td>Стручковая фасоль</td><td>190°C · 12 мин</td></tr>
      <tr><td>Спаржа зелёная</td><td>190°C · 10 мин</td></tr>
      <tr><td>Морковь кусками</td><td>190°C · 18 мин</td></tr>
      <tr><td>Цукини кружками</td><td>190°C · 12 мин</td></tr>
      <tr><td>Перец полосками</td><td>190°C · 12 мин</td></tr>
      <tr><td>Шпинат (отжать!)</td><td>190°C · 5 мин</td></tr>
      <tr><td>Эдамаме — до 90 г</td><td>190°C · 8 мин</td></tr>
      <tr><td>Брокколи — до 100 г</td><td>190°C · 12 мин</td></tr>
    </table>
    <ul>
      <li><b>Цукини всегда отжимать.</b> Он на 94% из воды: нарезать кружками, посолить, дать постоять 10 минут, отжать рукой. Не сделаешь — запеканка поплывёт. Это главная ошибка.</li>
      <li>Хранение в стеклянном контейнере: перец и цукини 4 дня, фасоль и спаржа 4 дня, морковь 5 дней.</li>
      <li>Грибы убраны из всех рецептов: маннит в них — частый триггер вздутия при чувствительном кишечнике.</li>
      <li>Брюссельская и белокочанная капуста не используются вообще.</li>
    </ul>
  </div>

  <div class="fact"><h3>Овощи без готовки, которые реально лежат</h3>
    <ul>
      <li><b>Minigurken</b> — маленькие огурцы целиком. Нет разрезанной поверхности, лежат неделю. Прямое решение проблемы «портится в холодильнике».</li>
      <li><b>Перец целиком</b> — 1–2 недели. Портится только разрезанный, поэтому режь по одному.</li>
      <li><b>Черри</b> — неделя, и держать на столе, а не в холодильнике: там вкуснее.</li>
      <li><b>Редис</b> — неделя, если оторвать ботву.</li>
      <li><b>Морковь</b> — три недели спокойно.</li>
      <li><b>Огурцы маринованные</b> — стоят вечно, ноль работы. Бери те, где в составе нет сахара.</li>
      <li><b>Фасоль и морковь из банки</b> — слил и готово.</li>
    </ul>
  </div>

  <div class="fact"><h3>Мидии — считай сам перед покупкой</h3>
    <table>
      <tr><td>В базе стоит</td><td>1,80 € / 100 г</td></tr>
      <tr><td>Это исходит из</td><td>9 € за пачку 500 г</td></tr>
      <tr><td>Если пачка 250 г</td><td>3,60 € / 100 г — вдвое дороже</td></tr>
    </table>
    <ul>
      <li><b>Посмотри на пачку в магазине и сверь.</b> От этого зависит, обычная это еда или редкое удовольствие.</li>
      <li>Цена 100 г белка из мидий при 1,80 € — это 7,50 €. Дороже тунца (5,38) и минтая (5,83), примерно как скумбрия (7,22), дешевле лосося (10,50).</li>
      <li>Плюс мидий не в цене белка, а в том, что жира там 4 г на 100 г — для желчного один из самых лёгких белков вообще. И это рекордсмен по витамину B12 и железу.</li>
      <li><b>Аэрогриль 190°C — 8 минут, не дольше.</b> Передержишь — станут резиновыми.</li>
      <li>Ферритин, насыщение трансферрина и B12 уже стоят в списке анализов. Результаты покажут, есть ли за тягой к мидиям что-то реальное.</li>
    </ul>
  </div>

  <div class="fact"><h3>Эдамаме</h3>
    <ul>
      <li>Молодые соевые бобы, <b>11 г белка на 100 г</b> — больше, чем у любого другого овоща.</li>
      <li>Заморозка, Rewe и Kaufland, примерно 2,50–3,00 € за 400–500 г.</li>
      <li><b>Порция до 90 г.</b> Больше — начинает пучить, там галактоолигосахариды.</li>
      <li>Готовые вегетарианские котлеты покупать невыгодно: белка 8–12 г на 100 г при цене как у мяса. Свои по рецепту «Заготовка: котлеты из эдамаме» выходят втрое дешевле.</li>
    </ul>
  </div>

  <div class="fact"><h3>Правила по переносимости</h3>
    <ul>
      <li><b>Не пропускать приёмы пищи.</b> Желчному нужна регулярность — при чувствительности к жирному это важнее калорий. Никакого голодания по 16 часов.</li>
      <li><b>Жир — дробно.</b> Масло отмерять ложкой, а не лить. Большая жирная порция за раз даёт боль справа под рёбрами.</li>
      <li><b>Жидкое горячее минимум раз в неделю</b> — в плане это четверг и пятница.</li>
      <li><b>Лук и чеснок</b> — частая причина вздутия. В рецептах их нет специально. Если хочется вкуса — зелёная часть порея.</li>
      <li>Появился новый продукт — вводи по одному и три дня смотри на реакцию, иначе не поймёшь, что не пошло.</li>
    </ul>
  </div>

  <div class="fact"><h3>Киш</h3>
    <ul>
      <li>Три варианта: с курицей и цукини (дешёвый, с него начинай), с лососем и шпинатом (раз в месяц), без теста на картофельном корже (можно чаще).</li>
      <li><b>Тесто печь вслепую 10 минут</b> перед заливкой, иначе низ останется сырым.</li>
      <li><b>Цукини и шпинат отжимать насухо.</b> Не отожмёшь — киш поплывёт.</li>
      <li><b>Дать постоять 15 минут</b> после духовки. Горячий развалится при нарезке.</li>
      <li>Сливки только безлактозные (laktosefreie Sahne) — обычные дадут вздутие.</li>
      <li>Форма 24 см = 4 порции.</li>
    </ul>
  </div>

  <div class="fact"><h3>Кухня без запаха и без посуды</h3>
    <ul>
      <li>Пергамент в корзину аэрогриля — потом просто выбрасываешь.</li>
      <li>Аэрогриль ест примерно втрое меньше электричества, чем духовка. Духовку включай только на полный противень.</li>
      <li>Кастрюлю всегда варить под крышкой — запах почти не идёт.</li>
      <li>После готовки: окно нараспашку на 10 минут. Не приоткрытое на весь вечер, а настежь и коротко — так выветривается и не выстывает.</li>
      <li>Форму из-под яиц и сыра сразу залей холодной водой.</li>
    </ul>
  </div>

  <div class="fact"><h3>Общие принципы</h3>
    <ul>
      <li>Жир умеренно и дробно, масло отмерять ложкой.</li>
      <li>Не пропускать приёмы пищи, есть по часам.</li>
      <li>Жидкое горячее минимум раз в неделю.</li>
      <li>Новый продукт вводить по одному и три дня смотреть на реакцию.</li>
      <li>Ходьба 40–60 минут в день, 10–15 минут сразу после еды.</li>
      <li>Взвешиваться раз в неделю утром. Первая неделя даёт 1,5–2 кг воды.</li>
    </ul>
  </div>`;
}

/* ============ события ============ */
document.querySelectorAll('.tabs button').forEach(b=>{
  b.onclick=()=>{
    document.querySelectorAll('.tabs button').forEach(x=>x.setAttribute('aria-selected', x===b));
    document.querySelectorAll('.page').forEach(p=>p.classList.toggle('on', p.id==='p-'+b.dataset.p));
    window.scrollTo({top:0,behavior:'instant'});
  };
});
document.addEventListener('click',e=>{
  const op=e.target.closest('[data-open]');
  if(op){ openRecipe(op.dataset.open); return; }
  const sw=e.target.closest('[data-swap]');
  if(sw){ doSwap(sw.dataset.swap); return; }
  const f=e.target.closest('[data-f]');
  if(f){ filter=f.dataset.f; renderCat(); return; }
  const md=e.target.closest('[data-mode]');
  if(md){ ideaMode=md.dataset.mode; renderIdeas(); return; }
  const bb=e.target.closest('[data-b]');
  if(bb){ const [k,i]=bb.dataset.b.split(':'); build[k]=+i; renderBuilder(); return; }
  if(e.target.id==='bdice'){
    Object.keys(build).forEach(k=>build[k]=Math.floor(Math.random()*BUILD[k].length));
    renderBuilder(); return;
  }
  const ls=e.target.closest('[data-ls]');
  if(ls){ luxSlot=ls.dataset.ls; renderIdeas(); return; }
  const ff=e.target.closest('[data-ff]');
  if(ff){ findFilter=ff.dataset.ff; renderIdeas(); return; }
  const pm=e.target.closest('[data-pm]');
  if(pm){ plateMode=pm.dataset.pm; renderPlate(); return; }
  const pn=e.target.closest('[data-pin]');
  if(pn){ const k=pn.dataset.pin; pins[k]=!pins[k]; save(); renderWeek(); return; }
  const ch=e.target.closest('[data-chk]');
  if(ch){ const k=ch.dataset.chk; checks[k]=!checks[k]; save(); renderShop(); return; }
  if(e.target.id==='closeSheet'||e.target.id==='mask'){ closeSheet(); }
});
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeSheet(); });

function doSwap(code){
  const [d,si]=code.split(':').map(Number);
  const plan=dayPlan(d); const cur=plan[si].r;
  const pool=poolFor(cur.s).filter(x=>x.id!==cur.id);
  const next=pool[Math.floor(Math.random()*pool.length)];
  if(si===0) week.br[d%2]=next;
  if(si===2) week.sn[d%3]=next;
  if(si===3) week.dn[d%3]=next;
  if(si===1){
    const m=LUNCH_MAP[d];
    if(m.src==='so') week.so=next; else week.lu[+m.src.slice(2)]=next;
  }
  save(); renderWeek(); renderShop();
}
// «гвоздь недели»: одно заведомо дорогое блюдо, вокруг которого режется остальное.
// Без этого экономный режим вычищает киши и запеканки подчистую.
function pickHighlight(){
  const slots=[
    {k:'lu0', set:r=>week.lu[0]=r, s:'lunch'},
    {k:'lu1', set:r=>week.lu[1]=r, s:'lunch'},
    {k:'br0', set:r=>week.br[0]=r, s:'breakfast'},
    {k:'br1', set:r=>week.br[1]=r, s:'breakfast'},
    {k:'dn0', set:r=>week.dn[0]=r, s:'dinner'},
    {k:'so',  set:r=>week.so=r,    s:'soup'}
  ];
  const sl=slots[Math.floor(Math.random()*slots.length)];
  const pool=[...bySlot(sl.s)].sort((a,b)=>b.c-a.c);
  const top=pool.slice(0, Math.max(3, Math.ceil(pool.length*0.45)));
  sl.set(top[Math.floor(Math.random()*top.length)]);
  return sl.k;
}

// Меню собирается свободно из всех рецептов. Бюджет — индикатор, а не фильтр.
// Уложиться в него можно кнопкой «Уложить в бюджет», когда сам захочешь.
function newWeek(keep){
  week=buildWeek(keep);
  enforceEggRules();
  ensureEdamame();
}
document.getElementById('regen').onclick=()=>{ pins={}; newWeek(null); checks={}; save(); renderWeek(); renderShop(); };
document.getElementById('regenSoft').onclick=()=>{ newWeek({br:week.br,dn:week.dn,sn:week.sn}); checks={}; save(); renderWeek(); renderShop(); };
document.getElementById('clearChecks').onclick=()=>{ checks={}; save(); renderShop(); };
document.getElementById('thrift').onclick=()=>{
  fitBudget();
  save(); renderWeek(); renderShop();
};
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-budget]');
  if(!b) return;
  FOOD_BUDGET = Math.max(80, Math.min(400, FOOD_BUDGET + (+b.dataset.budget)));
  save(); renderInfo(); renderWeek(); renderShop();
});

/* ============ сохранение ============ */
async function save(){
  await store.set('kitchen:v1', JSON.stringify({
    br:week.br.map(r=>r.id), dn:week.dn.map(r=>r.id), sn:week.sn.map(r=>r.id),
    lu:week.lu.map(r=>r.id), so:week.so.id, checks, pins, budget:FOOD_BUDGET
  }));
}
async function load(){
  try{
    const raw=await store.get('kitchen:v1');
    if(!raw) return false;
    const s=JSON.parse(raw);
    const g=id=>R.find(r=>r.id===id);
    week={br:s.br.map(g),dn:s.dn.map(g),sn:s.sn.map(g),lu:s.lu.map(g),so:g(s.so)};
    if(week.br.some(x=>!x)||week.dn.some(x=>!x)||!week.so) return false;
    checks=s.checks||{}; pins=s.pins||{}; if(s.budget) FOOD_BUDGET=s.budget;
    return true;
  }catch(e){ return false; }
}

(async function init(){
  const ok=await load();
  if(!ok){ newWeek(null); checks={}; }
  renderInfo(); renderWeek(); renderShop(); renderCat(); renderIdeas(); renderBuilder(); renderPlate(); renderHeader();
})();
