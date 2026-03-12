import { useState, useEffect } from "react";

// ── Themes ───────────────────────────────────────────────────
const THEMES = {
  dark: {
    bg:      "#0e0b1a",
    surface: "#1d1434",
    header:  "#1d1434",
    border:  "rgba(153,0,255,0.22)",
    text:    "#DFE8ED",
    muted:   "rgba(223,232,237,0.45)",
    roxo:    "#9900ff",
    teal:    "#33cccc",
    btn:     "#9900ff",
    btnText: "#ffffff",
    glow:    "0 4px 20px rgba(153,0,255,0.35)",
    radial:  () => `radial-gradient(ellipse at 60% 0%,rgba(153,0,255,0.18) 0%,transparent 60%),#0e0b1a`,
    catActive:         "#9900ff",
    catText:           "#DFE8ED",
    numBg:             "rgba(153,0,255,0.12)",
    numHover:          "rgba(153,0,255,0.25)",
    qrFill:            "#1d1434",
    ticketBadgeBg:     "rgba(51,204,204,0.1)",
    ticketBadgeBorder: "rgba(51,204,204,0.3)",
    ticketBadgeText:   "#33cccc",
    successBg:         "#1d1434",
  },
  light: {
    bg:      "#DFE8ED",
    surface: "#ffffff",
    header:  "#1d1434",
    border:  "rgba(153,0,255,0.2)",
    text:    "#1d1434",
    muted:   "rgba(29,20,52,0.5)",
    roxo:    "#9900ff",
    teal:    "#1a9999",
    btn:     "#1d1434",
    btnText: "#DFE8ED",
    glow:    "0 4px 20px rgba(29,20,52,0.2)",
    radial:  () => `radial-gradient(ellipse at 60% 0%,rgba(153,0,255,0.07) 0%,transparent 55%),#DFE8ED`,
    catActive:         "#1d1434",
    catText:           "#DFE8ED",
    numBg:             "rgba(29,20,52,0.07)",
    numHover:          "rgba(29,20,52,0.14)",
    qrFill:            "#1d1434",
    ticketBadgeBg:     "rgba(26,153,153,0.1)",
    ticketBadgeBorder: "rgba(26,153,153,0.3)",
    ticketBadgeText:   "#1a9999",
    successBg:         "#ffffff",
  },
};

// ── Brand ────────────────────────────────────────────────────
function OrdimLogo({ size=32, showText=true }) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="13" fill="#9900ff"/>
        <circle cx="24" cy="22" r="10" stroke="white" strokeWidth="3.5" fill="none"/>
        <circle cx="24" cy="22" r="4" fill="white"/>
        <rect x="14" y="34" width="20" height="3" rx="1.5" fill="white" opacity="0.4"/>
      </svg>
      {showText && (
        <span style={{fontWeight:800,fontSize:size*0.85,letterSpacing:"-0.5px",color:"#9900ff"}}>
          ordim
        </span>
      )}
    </div>
  );
}

// ── Theme Toggle ─────────────────────────────────────────────
function ThemeToggle({ theme, setTheme }) {
  const isDark = theme==="dark";
  return (
    <button onClick={()=>setTheme(isDark?"light":"dark")}
      style={{display:"flex",alignItems:"center",gap:6,padding:"6px 14px",borderRadius:20,
        border:"1px solid rgba(153,0,255,0.3)",background:"rgba(153,0,255,0.1)",
        color:isDark?"#DFE8ED":"#1d1434",cursor:"pointer",fontSize:13,fontWeight:600,transition:"all 0.2s"}}>
      {isDark?"☀️ Claro":"🌙 Escuro"}
    </button>
  );
}

// ── Helpers ──────────────────────────────────────────────────
const storage = {
  async get(k) { try { const r=await window.storage?.get(k); return r?JSON.parse(r.value):null; } catch { return null; } },
  async set(k,v) { try { await window.storage?.set(k,JSON.stringify(v)); } catch {} },
};
const COMPANIES = {
  "1234":{ id:1, name:"Burger House", plan:"pro" },
  "5678":{ id:2, name:"Pasta & Co",   plan:"starter" },
  "9999":{ id:3, name:"Sweet Corner", plan:"free" },
};
const TERMINALS = {
  1:[{id:1,label:"Totem 1 - Entrada",tef_number:"TEF-001-A"},{id:2,label:"Totem 2 - Caixa",tef_number:"TEF-001-B"}],
  2:[{id:3,label:"Totem 1 - Salão",  tef_number:"TEF-002-A"}],
  3:[{id:4,label:"Totem 1 - Balcão", tef_number:"TEF-003-A"}],
};
const CATALOG = {
  1:{ categories:["Hambúrgueres","Bebidas","Sobremesas"], products:[
    {id:1,cat:"Hambúrgueres",name:"Classic Burger",   price:28.90,emoji:"🍔",desc:"Pão brioche, carne 180g, queijo, alface, tomate"},
    {id:2,cat:"Hambúrgueres",name:"BBQ Bacon Burger", price:34.90,emoji:"🥓",desc:"Carne 200g, bacon crocante, molho BBQ, cheddar"},
    {id:3,cat:"Hambúrgueres",name:"Veggie Burger",    price:29.90,emoji:"🥗",desc:"Hambúrguer de grão-de-bico, rúcula, tomate seco"},
    {id:4,cat:"Bebidas",     name:"Refrigerante",     price:7.90, emoji:"🥤",desc:"Lata 350ml — Coca, Guaraná, Sprite"},
    {id:5,cat:"Bebidas",     name:"Suco Natural",     price:12.90,emoji:"🍊",desc:"Laranja, limão ou maracujá"},
    {id:6,cat:"Bebidas",     name:"Milk Shake",       price:18.90,emoji:"🥛",desc:"Chocolate, morango ou baunilha 400ml"},
    {id:7,cat:"Sobremesas",  name:"Brownie",          price:11.90,emoji:"🍫",desc:"Brownie quentinho com sorvete de creme"},
    {id:8,cat:"Sobremesas",  name:"Cheesecake",       price:14.90,emoji:"🍰",desc:"Cheesecake de frutas vermelhas"},
  ]},
  2:{ categories:["Massas","Entradas","Bebidas"], products:[
    {id:1,cat:"Massas",  name:"Spaghetti Bolonhesa",price:38.90,emoji:"🍝",desc:"Massa artesanal, molho de carne ao tomate"},
    {id:2,cat:"Massas",  name:"Fettuccine Alfredo", price:36.90,emoji:"🍜",desc:"Creme de parmesão e manteiga"},
    {id:3,cat:"Massas",  name:"Lasanha da Casa",    price:42.90,emoji:"🫕",desc:"Carne, presunto e molho béchamel"},
    {id:4,cat:"Entradas",name:"Bruschetta",         price:19.90,emoji:"🥖",desc:"Pão italiano, tomate, manjericão, azeite"},
    {id:5,cat:"Bebidas", name:"Água Mineral",       price:5.90, emoji:"💧",desc:"500ml com ou sem gás"},
    {id:6,cat:"Bebidas", name:"Vinho da Casa",      price:28.90,emoji:"🍷",desc:"Taça de vinho tinto ou branco"},
  ]},
  3:{ categories:["Doces","Salgados","Bebidas"], products:[
    {id:1,cat:"Doces",   name:"Brigadeiro Gourmet",price:6.90, emoji:"🍬",desc:"Brigadeiro belga em 3 sabores"},
    {id:2,cat:"Doces",   name:"Waffle",            price:18.90,emoji:"🧇",desc:"Com Nutella, frutas ou doce de leite"},
    {id:3,cat:"Salgados",name:"Coxinha",           price:8.90, emoji:"🫓",desc:"Coxinha de frango com catupiry"},
    {id:4,cat:"Salgados",name:"Mini Quiche",       price:12.90,emoji:"🥧",desc:"Quiche lorraine mini (4 unidades)"},
    {id:5,cat:"Bebidas", name:"Café Especial",     price:9.90, emoji:"☕",desc:"Espresso, cappuccino ou latte"},
    {id:6,cat:"Bebidas", name:"Chá Gelado",        price:8.90, emoji:"🧋",desc:"Pêssego, limão ou hibisco 400ml"},
  ]},
};
const genRef  = () => "P"+Math.floor(100000+Math.random()*900000);
const genCode = () => { const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; return Array.from({length:8},()=>c[Math.floor(Math.random()*c.length)]).join(""); };
const fmt     = v  => v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});

// ── Btn helper ───────────────────────────────────────────────
function Btn({ T, onClick, disabled, children, style={} }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{background:disabled?"rgba(150,150,150,0.15)":hov?`${T.btn}cc`:T.btn,
        color:disabled?"rgba(200,200,200,0.4)":T.btnText,
        border:"none",borderRadius:12,fontWeight:700,cursor:disabled?"default":"pointer",
        transition:"background 0.15s",boxShadow:disabled?"none":T.glow,...style}}>
      {children}
    </button>
  );
}

// ── QR visual ────────────────────────────────────────────────
function QRPlaceholder({ code, T, size=96 }) {
  const seed = code.split("").reduce((a,c)=>a+c.charCodeAt(0),0);
  const cells = Array.from({length:100},(_,i)=>((seed*i*17+i*7)%13)<6);
  return (
    <div style={{width:size,height:size,display:"grid",gridTemplateColumns:"repeat(10,1fr)",gap:1,padding:5,background:"white",borderRadius:6}}>
      {cells.map((on,i)=><div key={i} style={{background:on?T.qrFill:"white",borderRadius:1}}/>)}
    </div>
  );
}

// ── Numpad ───────────────────────────────────────────────────
function Numpad({ onPress, onDel, T }) {
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
      {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((k,i)=>(
        <button key={i} onClick={()=>k==="⌫"?onDel():k!==""?onPress(String(k)):null}
          style={{padding:"18px 0",fontSize:20,fontWeight:600,
            background:k===""?"transparent":T.numBg,
            color:T.text,border:"1px solid",borderColor:k===""?"transparent":T.border,
            borderRadius:12,cursor:k===""?"default":"pointer",transition:"all 0.12s"}}
          onMouseEnter={e=>k!==""&&(e.currentTarget.style.background=T.numHover)}
          onMouseLeave={e=>e.currentTarget.style.background=k===""?"transparent":T.numBg}
        >{k}</button>
      ))}
    </div>
  );
}

// ── SCREENS ──────────────────────────────────────────────────
function PinScreen({ onLogin, theme, setTheme, T }) {
  const [pin,setPin]     = useState("");
  const [error,setError] = useState("");
  const [shake,setShake] = useState(false);

  const press = v => {
    if (pin.length>=4) return;
    const next=pin+v; setPin(next);
    if (next.length===4) setTimeout(()=>tryLogin(next),150);
  };
  const tryLogin = p => {
    const co=COMPANIES[p];
    if (co) { setError(""); onLogin(co); }
    else { setShake(true); setError("PIN inválido. Tente novamente."); setTimeout(()=>{setPin("");setShake(false);},600); }
  };

  return (
    <div style={{minHeight:"100vh",background:T.radial(),display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",transition:"background 0.3s"}}>
      <div style={{position:"absolute",top:20,right:24}}><ThemeToggle theme={theme} setTheme={setTheme}/></div>
      <div style={{marginBottom:32,textAlign:"center"}}>
        <div style={{display:"flex",justifyContent:"center",marginBottom:16}}><OrdimLogo size={56}/></div>
        <p style={{color:T.muted,fontSize:14,marginTop:4}}>Digite o PIN da empresa para começar</p>
      </div>
      <div style={{background:T.surface,backdropFilter:"blur(20px)",border:`1px solid ${T.border}`,borderRadius:24,padding:32,width:320,boxShadow:"0 8px 40px rgba(153,0,255,0.12)"}}>
        <div style={{display:"flex",justifyContent:"center",gap:16,marginBottom:24,animation:shake?"shake 0.4s":"none"}}>
          {[0,1,2,3].map(i=>(
            <div key={i} style={{width:16,height:16,borderRadius:"50%",background:pin.length>i?T.roxo:T.border,transition:"background 0.15s",boxShadow:pin.length>i?`0 0 10px ${T.roxo}`:""}}/>
          ))}
        </div>
        {error && <p style={{color:"#cc3366",textAlign:"center",fontSize:13,marginBottom:12}}>{error}</p>}
        <Numpad onPress={press} onDel={()=>setPin(p=>p.slice(0,-1))} T={T}/>
        <p style={{color:T.muted,textAlign:"center",fontSize:11,marginTop:20,opacity:0.6}}>Demo: 1234 · 5678 · 9999</p>
      </div>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}`}</style>
    </div>
  );
}

function TerminalScreen({ company, onSelect, theme, setTheme, T }) {
  const terminals = TERMINALS[company.id]||[];
  return (
    <div style={{minHeight:"100vh",background:T.radial(),display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",transition:"background 0.3s"}}>
      <div style={{position:"absolute",top:20,right:24}}><ThemeToggle theme={theme} setTheme={setTheme}/></div>
      <div style={{textAlign:"center",marginBottom:32}}>
        <OrdimLogo size={40}/>
        <h2 style={{color:T.text,fontSize:22,fontWeight:700,margin:"16px 0 4px"}}>{company.name}</h2>
        <p style={{color:T.muted,fontSize:14}}>Selecione o terminal</p>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:12,width:320}}>
        {terminals.map(t=>(
          <button key={t.id} onClick={()=>onSelect(t)}
            style={{padding:"20px 24px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:16,color:T.text,cursor:"pointer",textAlign:"left",transition:"all 0.15s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=T.roxo;e.currentTarget.style.boxShadow=T.glow;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.boxShadow="none";}}>
            <div style={{fontWeight:700,fontSize:16}}>{t.label}</div>
            <div style={{color:T.teal,fontSize:12,marginTop:4,fontWeight:600}}>TEF: {t.tef_number}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function CatalogScreen({ company, terminal, onOrder, theme, setTheme, T }) {
  const catalog = CATALOG[company.id];
  const [activeCat,setActiveCat] = useState(catalog.categories[0]);
  const [cart,setCart]           = useState([]);
  const [cartOpen,setCartOpen]   = useState(false);

  const add    = p => setCart(c=>{ const ex=c.find(i=>i.id===p.id); return ex?c.map(i=>i.id===p.id?{...i,qty:i.qty+1}:i):[...c,{...p,qty:1}]; });
  const remove = id => setCart(c=>{ const ex=c.find(i=>i.id===id); return ex?.qty===1?c.filter(i=>i.id!==id):c.map(i=>i.id===id?{...i,qty:i.qty-1}:i); });
  const total  = cart.reduce((s,i)=>s+i.price*i.qty,0);
  const count  = cart.reduce((s,i)=>s+i.qty,0);
  const prods  = catalog.products.filter(p=>p.cat===activeCat);

  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",flexDirection:"column",transition:"background 0.3s"}}>
      <div style={{background:T.header,padding:"14px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${T.border}`}}>
        <div style={{display:"flex",flexDirection:"column",gap:3}}>
          <OrdimLogo size={22}/>
          <div style={{color:T.teal,fontSize:11,fontWeight:600,marginLeft:2}}>{terminal.label}</div>
        </div>
        <ThemeToggle theme={theme} setTheme={setTheme}/>
      </div>

      <div style={{display:"flex",gap:8,padding:"14px 24px",overflowX:"auto",borderBottom:`1px solid ${T.border}`,background:theme==="dark"?"rgba(29,20,52,0.6)":"rgba(223,232,237,0.8)"}}>
        {catalog.categories.map(cat=>(
          <button key={cat} onClick={()=>setActiveCat(cat)}
            style={{padding:"8px 18px",borderRadius:20,border:`1px solid ${activeCat===cat?T.btn:T.border}`,
              background:activeCat===cat?T.catActive:"transparent",
              color:activeCat===cat?T.catText:T.muted,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",transition:"all 0.15s",fontSize:14}}>
            {cat}
          </button>
        ))}
      </div>

      <div style={{flex:1,padding:24,paddingBottom:108,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:16,alignContent:"start",overflowY:"auto"}}>
        {prods.map(p=>{
          const inCart=cart.find(i=>i.id===p.id);
          return (
            <div key={p.id} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:16,padding:20,display:"flex",flexDirection:"column",gap:10,transition:"box-shadow 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.boxShadow=T.glow}
              onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
              <div style={{fontSize:40,textAlign:"center"}}>{p.emoji}</div>
              <div style={{color:T.text,fontWeight:700,fontSize:15}}>{p.name}</div>
              <div style={{color:T.muted,fontSize:12,flexGrow:1}}>{p.desc}</div>
              <div style={{color:T.teal,fontWeight:800,fontSize:18}}>{fmt(p.price)}</div>
              {inCart ? (
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:T.numBg,border:`1px solid ${T.border}`,borderRadius:10,padding:"4px 8px"}}>
                  <button onClick={()=>remove(p.id)} style={{background:"none",border:"none",color:T.text,fontSize:20,cursor:"pointer",padding:"0 4px"}}>−</button>
                  <span style={{color:T.text,fontWeight:700}}>{inCart.qty}</span>
                  <button onClick={()=>add(p)} style={{background:"none",border:"none",color:T.text,fontSize:20,cursor:"pointer",padding:"0 4px"}}>+</button>
                </div>
              ) : (
                <Btn T={T} onClick={()=>add(p)} style={{padding:"10px",fontSize:14,borderRadius:10}}>Adicionar</Btn>
              )}
            </div>
          );
        })}
      </div>

      {/* Botão fixo rodapé */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,padding:"12px 20px 18px",background:theme==="dark"?`linear-gradient(0deg,${T.bg} 70%,transparent)`:`linear-gradient(0deg,${T.bg} 80%,transparent)`,zIndex:50}}>
        {count>0 && (
          <p style={{textAlign:"center",color:T.teal,fontSize:13,marginBottom:8,fontWeight:600}}>
            ✅ Itens selecionados — clique abaixo para finalizar a compra
          </p>
        )}
        <button onClick={()=>count>0&&setCartOpen(true)}
          style={{width:"100%",padding:"17px 24px",
            background:count>0?T.btn:"transparent",
            border:`1px solid ${count>0?"transparent":T.border}`,
            borderRadius:16,color:count>0?T.btnText:T.muted,
            fontWeight:700,fontSize:16,cursor:count>0?"pointer":"default",
            display:"flex",alignItems:"center",justifyContent:"space-between",
            transition:"all 0.2s",boxShadow:count>0?T.glow:"none"}}>
          <span>🛒 {count>0?`Finalizar compra (${count} item${count>1?"s":""})`:"Carrinho vazio"}</span>
          {count>0 && (
            <span style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{background:"rgba(0,0,0,0.18)",borderRadius:10,padding:"4px 14px",fontSize:17,fontWeight:800}}>{fmt(total)}</span>
              <span style={{fontSize:20}}>→</span>
            </span>
          )}
        </button>
      </div>

      {/* Cart Drawer */}
      {cartOpen && (
        <div style={{position:"fixed",inset:0,zIndex:100}}>
          <div onClick={()=>setCartOpen(false)} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.6)"}}/>
          <div style={{position:"absolute",right:0,top:0,bottom:0,width:380,background:theme==="dark"?T.header:T.surface,borderLeft:`1px solid ${T.border}`,display:"flex",flexDirection:"column",padding:24,gap:16,overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <h3 style={{color:T.text,margin:0,fontSize:20,fontWeight:700}}>🛒 Carrinho</h3>
              <button onClick={()=>setCartOpen(false)} style={{background:T.numBg,border:`1px solid ${T.border}`,color:T.text,borderRadius:8,padding:"6px 12px",cursor:"pointer"}}>✕</button>
            </div>
            {cart.length===0 ? <p style={{color:T.muted,textAlign:"center",marginTop:40}}>Carrinho vazio</p> : (
              <>
                {cart.map(i=>(
                  <div key={i.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:`1px solid ${T.border}`}}>
                    <span style={{fontSize:28}}>{i.emoji}</span>
                    <div style={{flex:1}}>
                      <div style={{color:T.text,fontWeight:600,fontSize:14}}>{i.name}</div>
                      <div style={{color:T.muted,fontSize:12}}>{fmt(i.price)} × {i.qty}</div>
                    </div>
                    <div style={{color:T.teal,fontWeight:700}}>{fmt(i.price*i.qty)}</div>
                    <div style={{display:"flex",gap:4}}>
                      <button onClick={()=>remove(i.id)} style={{background:T.numBg,border:`1px solid ${T.border}`,color:T.text,borderRadius:6,width:28,height:28,cursor:"pointer"}}>−</button>
                      <button onClick={()=>add(i)}        style={{background:T.numBg,border:`1px solid ${T.border}`,color:T.text,borderRadius:6,width:28,height:28,cursor:"pointer"}}>+</button>
                    </div>
                  </div>
                ))}
                <div style={{marginTop:"auto"}}>
                  <div style={{display:"flex",justifyContent:"space-between",padding:"16px 0",borderTop:`1px solid ${T.border}`}}>
                    <span style={{color:T.muted,fontSize:16}}>Total</span>
                    <span style={{color:T.text,fontWeight:800,fontSize:22}}>{fmt(total)}</span>
                  </div>
                  <Btn T={T} onClick={()=>{setCartOpen(false);onOrder(cart,total);}} style={{width:"100%",padding:16,fontSize:16,borderRadius:14}}>
                    Ir para pagamento →
                  </Btn>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CpfScreen({ onNext, onSkip, theme, setTheme, T }) {
  const [digits,setDigits] = useState("");
  const fmtCpf = d => d.slice(0,11).replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})\.(\d{3})(\d)/,"$1.$2.$3").replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/,"$1.$2.$3-$4");
  const press  = v => setDigits(d=>d.length<11?d+v:d);
  const done   = digits.length===11;

  return (
    <div style={{minHeight:"100vh",background:T.radial(),display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",transition:"background 0.3s"}}>
      <div style={{position:"absolute",top:20,right:24}}><ThemeToggle theme={theme} setTheme={setTheme}/></div>
      <div style={{marginBottom:24,textAlign:"center"}}>
        <div style={{fontSize:44,marginBottom:8}}>🧾</div>
        <h2 style={{color:T.text,fontSize:26,fontWeight:800,margin:0}}>CPF na nota?</h2>
        <p style={{color:T.muted,marginTop:8,fontSize:14}}>Opcional — para participar de promoções</p>
      </div>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:24,padding:32,width:320,boxShadow:"0 8px 40px rgba(153,0,255,0.1)"}}>
        <div style={{textAlign:"center",padding:"14px 0",marginBottom:20,background:T.numBg,border:`1px solid ${T.border}`,borderRadius:12,letterSpacing:3,fontSize:20,fontWeight:700,color:done?T.text:T.muted}}>
          {fmtCpf(digits)||"000.000.000-00"}
        </div>
        <Numpad onPress={press} onDel={()=>setDigits(d=>d.slice(0,-1))} T={T}/>
        <Btn T={T} onClick={()=>onNext(digits)} disabled={!done} style={{width:"100%",marginTop:16,padding:14,fontSize:16,borderRadius:12}}>
          Confirmar CPF
        </Btn>
        <button onClick={onSkip}
          style={{width:"100%",marginTop:10,padding:12,background:"transparent",border:`1px solid ${T.border}`,borderRadius:12,color:T.muted,cursor:"pointer",fontSize:14}}>
          Pular esta etapa
        </button>
      </div>
    </div>
  );
}

function PaymentScreen({ total, onPay, onBack, theme, setTheme, T }) {
  const [method,setMethod]         = useState(null);
  const [processing,setProcessing] = useState(false);
  const methods = [
    {id:"credit",label:"Crédito",emoji:"💳",desc:"À vista ou parcelado"},
    {id:"debit", label:"Débito", emoji:"🏦",desc:"Débito em conta"},
    {id:"pix",   label:"PIX",    emoji:"⚡",desc:"Transferência instantânea"},
  ];
  const pay = async () => {
    if (!method) return;
    setProcessing(true);
    await new Promise(r=>setTimeout(r,2200));
    const approved=Math.random()<0.95;
    setProcessing(false);
    onPay({method,approved,nsu:"NSU"+Date.now(),auth:"AUT"+Math.floor(Math.random()*999999)});
  };

  return (
    <div style={{minHeight:"100vh",background:T.radial(),display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:28,transition:"background 0.3s"}}>
      <div style={{position:"absolute",top:20,right:24}}><ThemeToggle theme={theme} setTheme={setTheme}/></div>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:44,marginBottom:8}}>💰</div>
        <h2 style={{color:T.text,fontSize:26,fontWeight:800,margin:0}}>Forma de pagamento</h2>
        <p style={{color:T.teal,fontSize:28,fontWeight:800,marginTop:8}}>{fmt(total)}</p>
      </div>
      <div style={{display:"flex",gap:14}}>
        {methods.map(m=>(
          <button key={m.id} onClick={()=>setMethod(m.id)}
            style={{padding:"24px 28px",
              background:method===m.id?T.btn:T.surface,
              border:`2px solid ${method===m.id?T.btn:T.border}`,
              borderRadius:18,color:method===m.id?T.btnText:T.text,
              cursor:"pointer",textAlign:"center",width:130,transition:"all 0.15s",
              boxShadow:method===m.id?T.glow:"none"}}>
            <div style={{fontSize:36,marginBottom:8}}>{m.emoji}</div>
            <div style={{fontWeight:700,fontSize:15}}>{m.label}</div>
            <div style={{color:method===m.id?"rgba(255,255,255,0.6)":T.muted,fontSize:11,marginTop:4}}>{m.desc}</div>
          </button>
        ))}
      </div>
      {processing ? (
        <div style={{textAlign:"center"}}>
          <div style={{width:48,height:48,border:`4px solid ${T.border}`,borderTop:`4px solid ${T.roxo}`,borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 16px"}}/>
          <p style={{color:T.muted}}>Processando pagamento…</p>
          <p style={{color:T.muted,fontSize:12,opacity:0.6}}>Aguarde a confirmação do terminal TEF</p>
        </div>
      ) : (
        <div style={{display:"flex",gap:12}}>
          <button onClick={onBack} style={{padding:"14px 28px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,color:T.muted,cursor:"pointer",fontWeight:600}}>← Voltar</button>
          <Btn T={T} onClick={pay} disabled={!method} style={{padding:"14px 40px",fontSize:16,borderRadius:12}}>
            Pagar {fmt(total)}
          </Btn>
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function SuccessScreen({ order, onNew, theme, setTheme, T }) {
  const [countdown,setCountdown] = useState(30);
  useEffect(()=>{
    const t=setInterval(()=>setCountdown(c=>{if(c<=1){clearInterval(t);onNew();}return c-1;}),1000);
    return ()=>clearInterval(t);
  },[]);

  return (
    <div style={{minHeight:"100vh",background:T.bg,overflowY:"auto",transition:"background 0.3s"}}>
      <div style={{position:"absolute",top:20,right:24,zIndex:10}}><ThemeToggle theme={theme} setTheme={setTheme}/></div>
      <div style={{background:T.successBg,padding:"40px 24px 32px",textAlign:"center",borderBottom:`1px solid ${T.border}`}}>
        <div style={{fontSize:56,marginBottom:8}}>✅</div>
        <h2 style={{color:T.text,fontSize:28,fontWeight:800,margin:0}}>Pagamento aprovado!</h2>
        <p style={{color:T.muted,marginTop:8}}>Pedido <strong style={{color:T.teal}}>{order.ref}</strong> · {fmt(order.total)}</p>
        <p style={{color:T.muted,fontSize:13,opacity:0.7}}>{order.method.toUpperCase()} · NSU {order.nsu}</p>
      </div>
      <div style={{padding:24}}>
        <h3 style={{color:T.muted,marginBottom:16,fontSize:16}}>🎫 Seus tickets ({order.tickets.length})</h3>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:14}}>
          {order.tickets.map((tk,i)=>(
            <div key={i} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:16,padding:20,display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
              <QRPlaceholder code={tk.code} T={T} size={100}/>
              <div style={{textAlign:"center"}}>
                <div style={{color:T.text,fontWeight:700,fontSize:14}}>{tk.name}</div>
                <div style={{color:T.muted,fontSize:12,marginTop:2,letterSpacing:1}}>{tk.code}</div>
                <div style={{color:T.muted,fontSize:11,opacity:0.6}}>{tk.unit}/{tk.total} unid.</div>
              </div>
              <div style={{background:T.ticketBadgeBg,border:`1px solid ${T.ticketBadgeBorder}`,borderRadius:20,padding:"4px 12px",color:T.ticketBadgeText,fontSize:11,fontWeight:700}}>
                PRONTO PARA RETIRAR
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{padding:"24px",textAlign:"center"}}>
        <p style={{color:T.muted,fontSize:14,marginBottom:16}}>Apresente o QR code no balcão para retirar seu pedido</p>
        <Btn T={T} onClick={onNew} style={{padding:"14px 40px",fontSize:16,borderRadius:14}}>Novo pedido</Btn>
        <p style={{color:T.muted,fontSize:12,marginTop:12,opacity:0.5}}>Reiniciando em {countdown}s…</p>
      </div>
    </div>
  );
}

function RefusedScreen({ onRetry, onCancel, theme, setTheme, T }) {
  return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:24,transition:"background 0.3s"}}>
      <div style={{position:"absolute",top:20,right:24}}><ThemeToggle theme={theme} setTheme={setTheme}/></div>
      <div style={{fontSize:56}}>❌</div>
      <h2 style={{color:T.text,fontSize:26,fontWeight:800,margin:0}}>Pagamento não autorizado</h2>
      <p style={{color:T.muted}}>Verifique os dados do cartão e tente novamente</p>
      <div style={{display:"flex",gap:12}}>
        <button onClick={onCancel} style={{padding:"14px 28px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,color:T.muted,cursor:"pointer",fontWeight:600}}>Cancelar</button>
        <Btn T={T} onClick={onRetry} style={{padding:"14px 32px",fontSize:15,borderRadius:12}}>Tentar novamente</Btn>
      </div>
    </div>
  );
}

// ── APP ──────────────────────────────────────────────────────
export default function App() {
  const [theme,setTheme]       = useState("dark");
  const [screen,setScreen]     = useState("pin");
  const [company,setCompany]   = useState(null);
  const [terminal,setTerminal] = useState(null);
  const [cart,setCart]         = useState([]);
  const [cartTotal,setCartTotal] = useState(0);
  const [cpf,setCpf]           = useState(null);
  const [order,setOrder]       = useState(null);

  const T = THEMES[theme];

  const handleLogin    = co => { setCompany(co); setScreen("terminal"); };
  const handleTerminal = t  => { setTerminal(t); setScreen("catalog"); };
  const handleOrder    = (c,total) => { setCart(c); setCartTotal(total); setScreen("cpf"); };
  const handleCpf      = c  => { setCpf(c||null); setScreen("payment"); };

  const handlePay = async result => {
    if (!result.approved) { setScreen("refused"); return; }
    const tickets = cart.flatMap(item=>Array.from({length:item.qty},(_,i)=>({code:genCode(),name:item.name,unit:i+1,total:item.qty,emoji:item.emoji})));
    const ref = genRef();
    const ord = {ref,total:cartTotal,method:result.method,nsu:result.nsu,tickets};
    setOrder(ord);
    const existing = await storage.get("fk_orders")||[];
    existing.unshift({...ord,company_id:company.id,terminal_id:terminal.id,cpf,status:"paid",created_at:new Date().toISOString()});
    await storage.set("fk_orders",existing.slice(0,200));
    setScreen("success");
  };

  const reset = () => { setScreen("pin"); setCompany(null); setTerminal(null); setCart([]); setCartTotal(0); setCpf(null); setOrder(null); };
  const props = { theme, setTheme, T };

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Metropolis:wght@400;500;600;700;800&display=swap');*{box-sizing:border-box;margin:0;padding:0;font-family:'Metropolis',Verdana,sans-serif}body{background:${T.bg};transition:background 0.3s}`}</style>
      {screen==="pin"      && <PinScreen      onLogin={handleLogin} {...props}/>}
      {screen==="terminal" && <TerminalScreen company={company} onSelect={handleTerminal} {...props}/>}
      {screen==="catalog"  && <CatalogScreen  company={company} terminal={terminal} onOrder={handleOrder} {...props}/>}
      {screen==="cpf"      && <CpfScreen      onNext={handleCpf} onSkip={()=>handleCpf(null)} {...props}/>}
      {screen==="payment"  && <PaymentScreen  total={cartTotal} onPay={handlePay} onBack={()=>setScreen("catalog")} {...props}/>}
      {screen==="success"  && <SuccessScreen  order={order} onNew={reset} {...props}/>}
      {screen==="refused"  && <RefusedScreen  onRetry={()=>setScreen("payment")} onCancel={reset} {...props}/>}
    </>
  );
}
