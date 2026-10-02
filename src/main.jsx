import React,{useEffect,useMemo,useState} from "react";
import {createRoot} from "react-dom/client";
import {Activity,BarChart3,Brain,CircleCheck,Globe2,Home,Newspaper,Settings as SettingsIcon,Shield,SlidersHorizontal,Trophy,Zap,ChevronRight,RefreshCw,Power,Target,Clock3} from "lucide-react";
import "./styles.css";

const TABS=[
 {id:"dashboard",label:"Dashboard",icon:Home},
 {id:"analyse",label:"AI Analyser",icon:Brain},
 {id:"resultat",label:"AI Resultat",icon:Target},
 {id:"performance",label:"AI Performance",icon:BarChart3},
 {id:"news",label:"AI News",icon:Newspaper},
 {id:"settings",label:"Settings",icon:SettingsIcon}
];

const demoTop6=[
 {rank:1,time:"19:00",league:"Europa League",home:"Roma",away:"Slavia Praha",tip:"1",market:"Hjemmeseier",confidence:78,odds:1.72,value:"+12%",risk:"Lav"},
 {rank:2,time:"21:00",league:"Conference League",home:"Fiorentina",away:"Genk",tip:"1",market:"Hjemmeseier",confidence:72,odds:1.80,value:"+9%",risk:"Lav"},
 {rank:3,time:"18:45",league:"Champions League",home:"PSV",away:"Sporting CP",tip:"Over 2.5",market:"Over 2.5 mål",confidence:69,odds:1.68,value:"+7%",risk:"Moderat"},
 {rank:4,time:"21:00",league:"Europa League",home:"Real Sociedad",away:"PAOK",tip:"1",market:"Hjemmeseier",confidence:67,odds:1.85,value:"+6%",risk:"Moderat"},
 {rank:5,time:"21:00",league:"Conference League",home:"Lugano",away:"Gent",tip:"X2",market:"Dobbelsjanse",confidence:66,odds:1.77,value:"+5%",risk:"Moderat"},
 {rank:6,time:"18:30",league:"Europa League",home:"Fenerbahçe",away:"Union SG",tip:"1",market:"Hjemmeseier",confidence:64,odds:1.83,value:"+4%",risk:"Moderat"}
];

const demoNews=[
 {source:"Sky Sports",age:"12 min",title:"Roma bekrefter nytt laguttak før kveldens kamp",text:"AI følger med på skader, lagoppstilling og siste nytt."},
 {source:"Football365",age:"34 min",title:"Slavia Praha uten flere nøkkelspillere",text:"Nyheten er knyttet til kveldens Europa-kamp."},
 {source:"La Gazzetta",age:"1 t",title:"Fiorentina forventer endring på topp",text:"AI vurderer om nyheten bør påvirke kampbildet."},
 {source:"Voetbal International",age:"2 t",title:"PSV i sterk form før neste europeiske kamp",text:"Form og nyhetsdata holdes adskilt i modellen."}
];

const initialSettings={footballApi:true,oddsApi:true,groq:true,openai:true,news:true};

function App(){
 const [tab,setTab]=useState("dashboard");
 const [settings,setSettings]=useState(()=>JSON.parse(localStorage.getItem("tmz-settings")||"null")||initialSettings);
 const [selected,setSelected]=useState(demoTop6[0]);
 useEffect(()=>localStorage.setItem("tmz-settings",JSON.stringify(settings)),[settings]);
 const toggle=k=>setSettings(s=>({...s,[k]:!s[k]}));
 return <div className="app">
   <header className="topbar">
    <div className="brand"><div className="logoMark">TM<span>Z</span></div><div><b>TRADEMIND<span>MZ</span></b><small>FOOTBALL INTELLIGENCE</small></div></div>
    <div className="topStatus"><span className="liveDot"/> EUROPA <span className="sep">•</span> AI ENGINE <strong>ONLINE</strong></div>
   </header>
   <main>{tab==="dashboard"&&<Dashboard onSelect={m=>{setSelected(m);setTab("analyse")}}/>}{tab==="analyse"&&<Analyse match={selected}/>} {tab==="resultat"&&<Results/>}{tab==="performance"&&<Performance/>}{tab==="news"&&<News/>}{tab==="settings"&&<Settings settings={settings} toggle={toggle}/>}</main>
   <nav className="bottomNav">{TABS.map(t=>{const I=t.icon;return <button key={t.id} className={tab===t.id?"active":""} onClick={()=>setTab(t.id)}><I size={18}/><span>{t.label}</span></button>})}</nav>
 </div>
}

function Dashboard({onSelect}){
 return <section className="page">
  <div className="hero"><div><div className="eyebrow"><Globe2 size={14}/> EUROPA-ENGINE</div><h1>AI finner de <em>6 beste</em> kampene.</h1><p>Alle europeiske kamper går gjennom et raskt pre-score. Bare topp 6 får full AI-analyse.</p></div><div className="heroStat"><Trophy size={22}/><strong>TOPP 6</strong><span>dagens analyser</span></div></div>
  <div className="sectionHead"><div><span className="eyebrow">AI SIGNAL</span><h2>Dagens beste tips</h2></div><button className="ghost"><RefreshCw size={15}/> Oppdater</button></div>
  <div className="topGrid">{demoTop6.map(m=><MatchCard key={m.rank} match={m} onClick={()=>onSelect(m)}/>)}</div>
  <div className="workflow"><div className="sectionHead"><div><span className="eyebrow">MOTOR</span><h2>Slik fungerer AI-en</h2></div></div><div className="steps">{["Europa-filter","Pre-score","Topp 6","Full AI","Resultat","Læring"].map((s,i)=><div className="step" key={s}><span>{i+1}</span><b>{s}</b>{i<5&&<ChevronRight size={16}/>}</div>)}</div></div>
 </section>
}

function MatchCard({match,onClick}){
 return <button className="matchCard" onClick={onClick}><div className="rank">#{match.rank}</div><div className="matchMeta">{match.time} · {match.league}</div><div className="teams"><strong>{match.home}</strong><span>vs</span><strong>{match.away}</strong></div><div className="pickRow"><span className="tip">{match.tip} · {match.market}</span><b>{match.confidence}%</b></div><div className="metrics"><span>Odds <b>{match.odds}</b></span><span>Verdi <b>{match.value}</b></span><span>Risiko <b>{match.risk}</b></span></div></button>
}

function Analyse({match}){
 return <section className="page"><div className="crumb">AI ANALYSER <span>›</span> {match.home} – {match.away}</div><div className="matchHero"><div><span className="eyebrow">{match.league} · {match.time}</span><h1>{match.home} <em>vs</em> {match.away}</h1><div className="pill good"><Zap size={14}/> STERKT SIGNAL</div></div><div className="bigChance"><strong>{match.confidence}%</strong><span>AI-sjanse</span></div></div><div className="analysisGrid"><div className="panel"><h3>AI PREDIKSJON</h3><div className="prediction">{match.tip}</div><div className="bar"><i style={{width:match.confidence+"%"}}/></div><div className="three"><span>Sannsynlighet <b>{match.confidence}%</b></span><span>Odds <b>{match.odds}</b></span><span>Verdi <b>{match.value}</b></span></div></div><div className="panel"><h3>AI VURDERING</h3><ul className="checks"><li><CircleCheck/> Form og resultater</li><li><CircleCheck/> Hjemme/borte-styrke</li><li><CircleCheck/> xG og målprofil</li><li><CircleCheck/> Odds og markedsverdi</li><li><CircleCheck/> Siste nyheter</li></ul></div><div className="panel wide"><h3><Newspaper/> NYTT FØR KAMPEN</h3>{demoNews.slice(0,3).map(n=><div className="newsLine" key={n.title}><b>{n.source}</b><span>{n.age}</span><p>{n.title}</p></div>)}</div></div></section>
}

function Results(){return <section className="page"><div className="sectionHead"><div><span className="eyebrow">FASIT</span><h1>AI Resultat</h1></div><div className="statMini"><b>67%</b><span>treff siste 30 dager</span></div></div><div className="resultList">{demoTop6.map((m,i)=><div className="resultRow" key={m.rank}><div className="resultTeams"><b>{m.home} – {m.away}</b><small>{m.league}</small></div><span>{m.tip}</span><strong className={i===3?"bad":"goodText"}>{i===3?"❌":"✓"} {i===3?"Feil":"Riktig"}</strong><small>Odds {m.odds}</small></div>)}</div></section>}

function Performance(){return <section className="page"><div className="sectionHead"><div><span className="eyebrow">LÆRING</span><h1>AI Performance</h1></div><div className="modelBadge"><Brain size={16}/> Modell v3.0</div></div><div className="perfCards"><div><span>Treffsikkerhet</span><b>67%</b><small>+8% siste periode</small></div><div><span>ROI</span><b>+12.4%</b><small>312 analyser</small></div><div><span>Brier score</span><b>0.18</b><small>lavere er bedre</small></div><div><span>Log loss</span><b>0.54</b><small>løpende måling</small></div></div><div className="panel chartPanel"><h3>UTVIKLING OVER TID</h3><div className="fakeChart">{[35,43,50,47,58,55,63,61,67,64,72,67,76].map((v,i)=><i key={i} style={{height:v+"%"}}/>)}</div><div className="chartLabels"><span>Juli</span><span>August</span><span>September</span><span>I dag</span></div></div><div className="panel"><h3>HVA MODELLEN LÆRER</h3><div className="learning"><CircleCheck/> Justerer vekting etter faktiske resultater</div><div className="learning"><CircleCheck/> Lærer av feilprediksjoner</div><div className="learning"><CircleCheck/> Måler verdi mot faktiske odds</div><div className="learning"><CircleCheck/> Void-kamper påvirker ikke treffprosent</div></div></section>}

function News(){return <section className="page"><div className="sectionHead"><div><span className="eyebrow">LIVE INFORMASJON</span><h1>AI News</h1></div><span className="pill"><span className="liveDot"/> NYTT</span></div><div className="newsFilters"><button className="active">Alle</button><button>Lagnytt</button><button>Skader</button><button>Oppstillinger</button><button>Trend</button></div><div className="newsFeed">{demoNews.concat(demoNews).map((n,i)=><article className="newsCard" key={i}><div className="sourceIcon"><Newspaper/></div><div><div className="newsTop"><b>{n.source}</b><span>{n.age}</span></div><h3>{n.title}</h3><p>{n.text}</p><small>AI relevans: {i%2?"Relevant":"Høy"} · Europa</small></div></article>)}</div></section>}

function Settings({settings,toggle}){const items=[["footballApi","Football API","Kamper, resultater og statistikk",Shield],["oddsApi","Odds API","Hent markedsodds",Activity],["groq","Groq AI","Rask AI-analyse",Zap],["openai","OpenAI","Avansert AI-analyse",Brain],["news","News Engine","Nyheter fra nettet",Newspaper]];return <section className="page"><div className="sectionHead"><div><span className="eyebrow">KONTROLLSENTER</span><h1>Settings</h1></div><SlidersHorizontal/></div><div className="settingsGrid"><div className="panel"><h3>API & SYSTEM</h3>{items.map(([k,name,desc,I])=><div className="settingRow" key={k}><div className="settingIcon"><I size={18}/></div><div className="settingText"><b>{name}</b><span>{desc}</span></div><button className={"switch "+(settings[k]?"on":"")} onClick={()=>toggle(k)}><i/></button></div>)}</div><div className="panel"><h3>SYSTEM STATUS</h3>{["Supabase Database","AI Engine","News Engine","Scheduler"].map((x,i)=><div className="statusRow" key={x}><span>{x}</span><b><span className="liveDot"/> {i===3?"Klar":"Tilkoblet"}</b></div>)}<button className="primary"><Power size={17}/> KJØR AI-ANALYSE NÅ</button></div></div></section>}

createRoot(document.getElementById("root")).render(<App/>);