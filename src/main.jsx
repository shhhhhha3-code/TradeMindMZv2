import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Home,Trophy,Globe2,LineChart,Newspaper,BarChart3,FlaskConical,Clock3,Target,Settings,ChevronRight,CheckCircle2,Brain,Database,Activity,ShieldAlert,Search,CalendarDays,Bell,Menu,X,TrendingUp,Zap} from 'lucide-react';
import './styles.css';
import {checkSupabaseConnection} from './lib/supabase.js';
import {getFootballDashboard,syncFootballData} from './lib/footballApi.js';

const picks=[
 {league:'Premier League',time:'16:00',home:'Liverpool',away:'Everton',homeShort:'LIV',awayShort:'EVE',tip:'Liverpool vinner',confidence:78,odds:'1.62',signal:'STARKT SIGNAL',value:'++',reasons:['Sterk hjemmeform (8-1-1)','Høyere xG (2.08 vs 1.11)','Everton flere skadefravær','Ekspert 7/10 mot Liverpool','Historisk sterk hjemmebane']},
 {league:'La Liga',time:'21:00',home:'Barcelona',away:'Sevilla',homeShort:'BAR',awayShort:'SEV',tip:'Over 2.5 mål',confidence:71,odds:'1.70',signal:'MODERAT SIGNAL',value:'++',reasons:['Begge lag scorer i 73% av kampene','Høyt tempo og offensiv spillestil','Barcelona høy xG (2.14)','Sevilla svak borteform','Eksperter 6/10 over 2.5 mål']}
];
const games=[['16:00','PL','Liverpool – Everton','Liverpool vinner','78%','1.62','++'],['18:30','Bundesliga','Bayern – Dortmund','Over 2.5 mål','66%','1.58','+'],['19:00','Serie A','Inter – Roma','Begge lag scorer','64%','1.72','+'],['21:00','La Liga','Barcelona – Sevilla','Over 2.5 mål','71%','1.70','++'],['21:00','Ligue 1','PSG – Marseille','PSG vinner','63%','1.65','+']];
const news=[['LIV','Salah tilgjengelig mot Everton','Liverpool-stjernen er tilbake i dagens kamptropp.','2 timer siden'],['BAR','Pedri usikker til kveldens kamp','Barcelona-midtbane-spilleren vurderes frem til kampstart.','3 timer siden'],['LA','Eksperter forventer mål fest','Flere eksperter mener Barcelona – Sevilla kan bli en åpen kamp.','4 timer siden']];
function Sidebar({active,setActive,mobile,setMobile}){const items=[['Hjem',Home],['Dagens tips',Trophy],['Alle kamper',Globe2],['AI analyse',LineChart],['Ekspertanalyse',Newspaper],['Statistikk',BarChart3],['Model Lab',FlaskConical],['Historikk',Clock3],['Value Finder',Target],['Innstillinger',Settings]];return <aside className={'sidebar '+(mobile?'open':'')}><div className="sideTop"><div className="brandMini"><span>⚽</span><div>FOOTBALL <b>AI</b></div></div><button className="close" onClick={()=>setMobile(false)}><X/></button></div><nav>{items.map(([label,Icon])=><button key={label} className={active===label?'active':''} onClick={()=>{setActive(label);setMobile(false)}}><Icon size={19}/><span>{label}</span></button>)}</nav><div className="sideNews"><div className="avatar">◉</div><div><small>SISTE NYTT</small><strong>Live AI-data</strong></div></div></aside>}
function Header({setMobile,onSync,syncing}){const [db,setDb]=useState({ok:false,status:'CHECKING'});useEffect(()=>{checkSupabaseConnection().then(setDb)},[]);const today=new Intl.DateTimeFormat('nb-NO',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date());return <header><button className="hamb" onClick={()=>setMobile(true)}><Menu/></button><div className="heroBrand"><div className="ball">⚽</div><div><h1>FOOTBALL <em>AI</em></h1><p>POWERED BY GROQ + OPENAI</p></div></div><div className="tagline">DATA + AI + EXPERTS <span>= SMARTER PREDICTIONS</span></div><div className="headRight"><button className="syncBtn" onClick={onSync} disabled={syncing}>{syncing?'SYNKRONISERER…':'↻ OPPDATER LIVE'}</button><div className={'dbStatus '+(db.ok?'online':'offline')}><span/>SUPABASE {db.ok?'ONLINE':'OFFLINE'}</div><div className="date"><CalendarDays size={17}/>{today}</div><Bell className="bell" size={20}/><div className="user">MZ⌄</div></div></header>}
function StatBar({matches,predictions,engine}){const evaluation=engine?.evaluation||{};const model=engine?.model||{};const items=[['⚽','DAGENS KAMPER',matches??'–'],['▥','ANALYSERTE KAMPER',matches??'–'],['★','AI KANDIDATER',predictions??'–'],['🏆','ÅPNE PREDIKSJONER',predictions??'–'],['◉','TREFFSIKKERHET',evaluation.accuracy!=null?evaluation.accuracy.toFixed(1)+'%':'–']];return <div className="statbar">{items.map(x=><div className="stat" key={x[1]}><i>{x[0]}</i><div><small>{x[1]}</small><strong>{x[2]}</strong></div></div>)}</div>}
function PickCard({p,index}){return <div className={'pick '+(index===0?'green':'gold')}><div className="pickHead"><b>🏆 PICK #{index+1}</b><span>{p.signal}</span></div><div className="match"><div><div className="crest">{p.homeShort}</div><strong>{p.home}</strong></div><div className="vs"><small>{p.league} · I dag · {p.time}</small>VS</div><div><div className="crest away">{p.awayShort}</div><strong>{p.away}</strong></div></div><div className="tipRow"><div className="tipBox"><small>TIPS</small><strong>{p.tip}</strong></div><div className="confidence"><small>AI CONFIDENCE</small><div className="ring" style={{'--v':p.confidence+'%'}}>{p.confidence}%</div></div><div className="odds"><small>ODDS</small><strong>{p.odds}</strong></div></div><ul>{p.reasons.map(r=><li key={r}><CheckCircle2 size={16}/>{r}</li>)}</ul><button className="analyse">SE FULL ANALYSE <ChevronRight size={16}/></button></div>}
function Engine({engine}){const model=engine?.model||{};const evaluation=engine?.evaluation||{};return <aside className="rightcol"><section className="panel"><div className="panelTitle"><Brain/>FOOTBALL AI ENGINE <ChevronRight/></div><div className="aiPair"><div><b>◈</b><span>GROQ<small>{engine?.groqConfigured===false?'KLAR NÅR NØKKEL FINNES':'REASONING'}</small></span></div><strong>+</strong><div><b className="openai">◉</b><span>OpenAI<small>{engine?.openaiConfigured===false?'KLAR NÅR NØKKEL FINNES':'DYP ANALYSE'}</small></span></div></div><div className="engineMetrics"><div><small>MODELL</small><b>{model.model_version||'football-multinomial-v1'}</b></div><div><small>LÆRINGSDATA</small><b>{model.training_samples??0}</b></div><div><small>TREFFSIKKERHET</small><b>{model.accuracy!=null?(model.accuracy*100).toFixed(1)+'%':'–'}</b></div><div><small>ROI / ENHET</small><b>{model.roi!=null?(model.roi*100).toFixed(2)+'%':'–'}</b></div></div><div className="pipelineMini">{['FORM','xG/PROXY','RESULTATER','ODDS','PROBABILITY','VALUE','EVALUERING','LÆRING'].map((x,i)=><span key={x} className={i<7?'done':''}>{x}</span>)}</div></section><section className="panel"><div className="panelTitle"><FlaskConical/>MODEL LAB <small>(LIVE)</small><ChevronRight/></div><div className="lab"><span>Treningsdata <b>{model.training_samples??0}</b></span><span>Treffsikkerhet <b className="greenTxt">{model.accuracy!=null?(model.accuracy*100).toFixed(1)+'%':'–'}</b></span><span>ROI <b className="greenTxt">{model.roi!=null?(model.roi*100).toFixed(2)+'%':'–'}</b></span><span>Brier <b>{model.brier_score!=null?Number(model.brier_score).toFixed(3):'–'}</b></span></div></section><section className="panel"><div className="panelTitle"><BarChart3/>TIPSTYPE STATISTIKK <ChevronRight/></div>{[['Hjemmeseier','69.1%'],['Uavgjort','32.4%'],['Borteseier','58.7%'],['Over 1.5 mål','78.4%'],['Over 2.5 mål','61.8%'],['Begge lag scorer','64.7%']].map(x=><div className="barline" key={x[0]}><span>{x[0]}</span><b>{x[1]}</b><i><em style={{width:x[1]}}/></i></div>)}</section><section className="panel week"><div className="panelTitle"><CalendarDays/>SISTE 7 DAGER</div><div className="weekline">🟢 <b>11 vinnere</b> <span>🔴 3 tap</span></div><div className="progress"><i style={{width:'78.6%'}}/></div><strong>78.6%</strong></section></aside>}
function Bottom(){return <div className="bottom"><section className="panel news"><div className="panelTitle"><Newspaper/> SISTE NYTT</div>{news.map(n=><div className="newsrow" key={n[1]}><div className="newsLogo">{n[0]}</div><div><b>{n[1]}</b><p>{n[2]}</p></div><small>{n[3]}</small></div>)}</section><section className="panel experts"><div className="panelTitle"><Search/> EKSPERTANALYSE</div>{[['Sky Sports','Liverpool should have enough quality to secure the win at Anfield.','78%'],['BBC Sport','Expect goals in Barcelona vs Sevilla. Both teams are in good attacking form.','71%'],['ESPN','Dortmund away has struggled defensively in recent weeks.','64%']].map(x=><div className="expert" key={x[0]}><b>{x[0]}</b><p>{x[1]}</p><strong>{x[2]}<small> For</small></strong></div>)}</section><section className="panel score"><div className="panelTitle"><Zap/> AI VURDERING</div>{[['Form','87'],['xG','82'],['Hjemme/borte','79'],['Skader','74'],['Innbyrdes','68'],['Odds/value','84'],['Ekspert signal','76']].map(x=><div className="scoreline" key={x[0]}><span>{x[0]}</span><i><em style={{width:x[1]+'%'}}/></i><b>{x[1]}</b></div>)}<div className="total">TOTAL AI SCORE <b>78/100</b></div></section></div>}
function Main(){
  const [active,setActive]=useState('Hjem');
  const [mobile,setMobile]=useState(false);
  const [liveMatches,setLiveMatches]=useState([]);
  const [livePredictions,setLivePredictions]=useState([]);
  const [engine,setEngine]=useState({});
  const [syncing,setSyncing]=useState(false);
  const [liveError,setLiveError]=useState('');

  const loadLive=async()=>{
    try{
      const data=await getFootballDashboard();
      if(data?.ok){setLiveMatches(data.matches||[]);setLivePredictions(data.predictions||[]);setEngine(data.engine||{});setLiveError('');}
    }catch(error){setLiveError(error?.message||'Live-data ikke tilgjengelig');}
  };
  useEffect(()=>{loadLive()},[]);

  const handleSync=async()=>{
    setSyncing(true);setLiveError('');
    try{await syncFootballData();await loadLive();}
    catch(error){setLiveError(error?.message||'Kunne ikke synkronisere live-data');}
    finally{setSyncing(false);}
  };

  const predictionByMatch=new Map(livePredictions.map(p=>[p.match_id,p]));
  const realPicks=liveMatches.map(m=>({match:m,prediction:predictionByMatch.get(m.id)})).filter(x=>x.prediction).slice(0,2);
  const displayPicks=realPicks.length?realPicks.map(x=>({
    league:x.match.league,
    time:new Date(x.match.kickoff_at).toLocaleTimeString('nb-NO',{hour:'2-digit',minute:'2-digit'}),
    home:x.match.home_team,away:x.match.away_team,
    homeShort:x.match.home_team.slice(0,3).toUpperCase(),awayShort:x.match.away_team.slice(0,3).toUpperCase(),
    tip:x.prediction.prediction,confidence:Number(x.prediction.confidence||0),
    odds:Number(x.prediction.odds||0).toFixed(2),
    signal:Number(x.prediction.confidence||0)>=70?'STARKT SIGNAL':'MODERAT SIGNAL',
    value:Number(x.prediction.value_percent||0)>=0?'++':'+',
    reasons:[
      'Modell: '+(x.prediction.model||'Football AI'),
      'Sannsynlighet: '+Number(x.prediction.confidence||0).toFixed(1)+'%',
      'Value: '+(x.prediction.value_percent!=null?Number(x.prediction.value_percent).toFixed(1)+'%':'ikke tilgjengelig'),
      x.prediction.reasoning?.llm?.summary||('Datakilde: '+(x.prediction.provider||'live'))
    ]
  })):picks;
  const displayGames=liveMatches.length?liveMatches.slice(0,20).map(m=>{
    const p=predictionByMatch.get(m.id);
    return [
      new Date(m.kickoff_at).toLocaleTimeString('nb-NO',{hour:'2-digit',minute:'2-digit'}),
      m.league,
      m.home_team+' – '+m.away_team,
      p?.prediction||'Analyseres',
      p?Math.round(Number(p.confidence))+'%':'–',
      p?Number(p.odds).toFixed(2):'–',
      p&&Number(p.value_percent)>=0?'++':'–'
    ];
  }):games;

  return <div className="app"><Sidebar active={active} setActive={setActive} mobile={mobile} setMobile={setMobile}/><main>
    <Header setMobile={setMobile} onSync={handleSync} syncing={syncing}/>
    <StatBar matches={liveMatches.length} predictions={livePredictions.length} engine={engine}/>
    {liveError&&<div className="liveNotice">LIVE-DATA: {liveError}. Visning bruker demo-data til tilkoblingen er klar.</div>}
    <div className="sectionTitle"><span/>DAGENS {realPicks.length||2} TIPS</div>
    <div className="grid"><div className="center"><div className="picks">{displayPicks.map((p,i)=><PickCard key={p.home+p.away} p={p} index={i}/>)}</div>
    <div className="filters"><button className="selected">Dagens kamper (live)</button>{['Premier League','La Liga','Serie A','Bundesliga','Champions League'].map(x=><button key={x}>{x}</button>)}<button>Flere ligaer⌄</button></div>
    <div className="table panel"><div className="tr th"><span>TID</span><span>LIGA</span><span>KAMP</span><span>TIPS</span><span>AI %</span><span>ODDS</span><span>VERDI</span><span>STATUS</span></div>{displayGames.map(g=><div className="tr" key={g[2]}>{g.map((v,i)=><span key={i} className={i===4?'greenTxt':''}>{v}</span>)}<span className="status">● Ikke startet</span></div>)}</div></div><Engine engine={engine}/></div><Bottom/></main></div>
}


createRoot(document.getElementById('root')).render(<Main />);
