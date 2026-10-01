import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Home,Trophy,Globe2,LineChart,Newspaper,BarChart3,FlaskConical,Clock3,Target,Settings,ChevronRight,CheckCircle2,Brain,Database,Activity,ShieldAlert,Search,CalendarDays,Bell,Menu,X,TrendingUp,Zap,SlidersHorizontal} from 'lucide-react';
import './styles.css';
import {checkFootballAiHealth} from './lib/footballApi.js';
import {getFootballDashboard,syncFootballData,getFootballHistory,trainFootballModel,getFootballDiagnostics,getFootballLearning,getFootballValidation} from './lib/footballApi.js';

const asArray = value => Array.isArray(value) ? value : [];

function Sidebar({active,setActive,mobile,setMobile}){const items=[['Hjem',Home],['AI Tips',Trophy],['Alle kamper',Globe2],['AI analyse',LineChart],['Ekspertanalyse',Newspaper],['Statistikk',BarChart3],['Model Lab',FlaskConical],['Historikk',Clock3],['Value Finder',Target],['Innstillinger',Settings]];return <aside className={'sidebar '+(mobile?'open':'')}><div className="sideTop"><div className="brandMini"><span className="mzMark">M</span><div>TRADE<span>MIND</span><b>MZ</b></div></div><button className="close" onClick={()=>setMobile(false)}><X/></button></div><nav>{items.map(([label,Icon])=><button key={label} className={active===label?'active':''} onClick={()=>{setActive(label);setMobile(false)}}><Icon size={19}/><span>{label}</span></button>)}</nav><div className="sideNews"><div className="avatar">◉</div><div><small>SISTE NYTT</small><strong>Live AI-data</strong></div></div></aside>}
function Header({setMobile,onSync,syncing}){const [db,setDb]=useState({ok:false,status:'CHECKING'});useEffect(()=>{let mounted=true;checkFootballAiHealth().then(data=>{if(mounted)setDb({ok:Boolean(data?.ok),status:data?.status||'UNKNOWN'})}).catch(error=>{if(mounted)setDb({ok:false,status:error?.message||'OFFLINE'})});return()=>{mounted=false}},[]);const today=new Intl.DateTimeFormat('nb-NO',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date());return <header><button className="hamb" onClick={()=>setMobile(true)}><Menu/></button><div className="heroBrand"><div className="brandLogoMark">M</div><div><h1>TRADEMIND<em>MZ</em></h1><p>AI POWERED FOOTBALL INSIGHTS</p></div></div><div className="tagline">DATA + AI + ODDS <span>= SMARTER DECISIONS</span></div><div className="headRight"><button className="syncBtn" onClick={onSync} disabled={syncing}>{syncing?'SYNKRONISERER…':'↻ OPPDATER LIVE'}</button><div className={'dbStatus '+(db.ok?'online':'offline')}><span/>BACKEND {db.ok?'ONLINE':'OFFLINE'}</div><div className="date"><CalendarDays size={17}/>{today}</div><Bell className="bell" size={20}/><div className="user">MZ⌄</div></div></header>}
function StatBar({matches,predictions,engine}){const evaluation=engine?.evaluation||{};const matchCount=Array.isArray(matches)?matches.length:Number(matches)||0;const predictionList=Array.isArray(predictions)?predictions:[];const predictionCount=Array.isArray(predictions)?predictions.length:Number(predictions)||0;const open=predictionList.filter(p=>String(p?.status||'OPEN').toUpperCase()==='OPEN').length;const items=[['⚽','KOMMENDE KAMPER',matchCount],['▥','ANALYSERTE KAMPER',predictionCount],['★','AI PREDIKSJONER',predictionCount],['🏆','ÅPNE PREDIKSJONER',open],['◉','TREFFSIKKERHET',evaluation.accuracy!=null?Number(evaluation.accuracy).toFixed(1)+'%':'–']];return <div className="statbar">{items.map(x=><div className="stat" key={x[1]}><i>{x[0]}</i><div><small>{x[1]}</small><strong>{x[2]}</strong></div></div>)}</div>}
function PickCard({p,index,onAnalyse}){return <div className={'pick '+(index===0?'green':'gold')}><div className="pickHead"><b>🏆 PICK #{index+1}</b><span>{p.signal}</span></div><div className="match"><div><div className="crest">{p.homeShort}</div><strong>{p.home}</strong></div><div className="vs"><small>{p.league} · I dag · {p.time}</small>VS</div><div><div className="crest away">{p.awayShort}</div><strong>{p.away}</strong></div></div><div className="tipRow"><div className="tipBox"><small>TIPS</small><strong>{p.tip}</strong></div><div className="confidence"><small>AI CONFIDENCE</small><div className="ring" style={{'--v':p.confidence+'%'}}>{p.confidence}%</div></div><div className="odds"><small>ODDS</small><strong>{p.odds&&p.odds!=='–'?p.odds:'Ingen odds'}</strong></div></div><div className="pickMeta"><span>AI <b>{Number(p.confidence||0).toFixed(0)}%</b></span><span>ODDS <b>{p.odds||'Ingen odds'}</b></span><span>VALUE <b className={Number(p.valuePercent)>0?'greenTxt':''}>{p.valuePercent!=null?(Number(p.valuePercent)>0?'+':'')+Number(p.valuePercent).toFixed(1)+'%':'–'}</b></span></div><ul>{p.reasons.map(r=><li key={r}><CheckCircle2 size={16}/>{r}</li>)}</ul><button className="analyse" onClick={onAnalyse}>SE FULL ANALYSE <ChevronRight size={16}/></button></div>}
function Engine({engine}){const model=engine?.model||{};return <aside className="rightcol"><section className="panel"><div className="panelTitle"><Brain/>TRADEMINDMZ ENGINE <ChevronRight/></div><div className="aiPair"><div><b>◈</b><span>GROQ<small>REASONING</small></span></div><strong>+</strong><div><b className="openai">◉</b><span>OpenAI<small>DYP ANALYSE</small></span></div></div><div className="engineMetrics"><div><small>MODELL</small><b>{model.model_version||'football-multinomial-v1'}</b></div><div><small>LÆRINGSDATA</small><b>{model.training_samples??0}</b></div><div><small>TREFFSIKKERHET</small><b>{model.accuracy!=null?(model.accuracy*100).toFixed(1)+'%':'–'}</b></div><div><small>ROI / ENHET</small><b>{model.roi!=null?(model.roi*100).toFixed(2)+'%':'–'}</b></div></div><div className="pipelineMini">{['FORM','xG/PROXY','RESULTATER','ODDS','PROBABILITY','VALUE','EVALUERING','LÆRING'].map((x,i)=><span key={x} className={i<7?'done':''}>{x}</span>)}</div></section><section className="panel"><div className="panelTitle"><FlaskConical/>MODEL LAB <small>(LIVE)</small><ChevronRight/></div><div className="lab"><span>Treningsdata <b>{model.training_samples??0}</b></span><span>Treffsikkerhet <b className="greenTxt">{model.accuracy!=null?(model.accuracy*100).toFixed(1)+'%':'–'}</b></span><span>ROI <b className="greenTxt">{model.roi!=null?(model.roi*100).toFixed(2)+'%':'–'}</b></span><span>Brier <b>{model.brier_score!=null?Number(model.brier_score).toFixed(3):'–'}</b></span></div></section><section className="panel week"><div className="panelTitle"><Database/>DATAKVALITET</div><div className="dataStatusRow"><span>Evalueringer</span><b>{engine?.evaluation?.samples??0}</b></div><div className="dataStatusRow"><span>Treffsikkerhet</span><b>{engine?.evaluation?.accuracy!=null?Number(engine.evaluation.accuracy).toFixed(1)+'%':'–'}</b></div><div className="dataStatusRow"><span>ROI / enhet</span><b>{engine?.evaluation?.roi_percent_per_unit!=null?Number(engine.evaluation.roi_percent_per_unit).toFixed(2)+'%':'–'}</b></div></section></aside>}
function Bottom({predictions,engine}){const predictionList=asArray(predictions);const value=predictionList.filter(p=>p.value_percent!=null&&Number(p.value_percent)>0).sort((a,b)=>Number(b.value_percent)-Number(a.value_percent)).slice(0,6);const model=engine?.model||{};return <div className="bottom"><section className="panel news"><div className="panelTitle"><Target/> VALUE FINDER <small>(LIVE)</small></div>{value.length?value.map(p=><div className="newsrow" key={p.id}><div className="newsLogo">+</div><div><b>{p.prediction}</b><p>AI {Number(p.confidence).toFixed(1)}% · Odds {p.odds?Number(p.odds).toFixed(2):'Ingen odds'}</p></div><strong className="greenTxt">+{Number(p.value_percent).toFixed(1)}%</strong></div>):<div className="emptyState">Ingen positiv value registrert akkurat nå.</div>}</section><section className="panel experts"><div className="panelTitle"><Database/> DATASTATUS</div><div className="dataStatusRow"><span>Kommende kamper</span><b>{predictionList.length}</b></div><div className="dataStatusRow"><span>Tips med odds</span><b>{predictionList.filter(p=>p.odds&&Number(p.odds)>1).length}</b></div><div className="dataStatusRow"><span>Positive value</span><b className="greenTxt">{value.length}</b></div><div className="dataStatusRow"><span>Modell</span><b>{model.model_version||'–'}</b></div><div className="dataStatusRow"><span>Treningsdata</span><b>{model.training_samples??0}</b></div></section><section className="panel score"><div className="panelTitle"><Zap/> AI-MÅLINGER <small>(LIVE)</small></div><div className="scoreline"><span>Treffsikkerhet</span><i><em style={{width:(model.accuracy!=null?model.accuracy*100:0)+'%'}}/></i><b>{model.accuracy!=null?(model.accuracy*100).toFixed(1)+'%':'–'}</b></div><div className="scoreline"><span>ROI</span><i><em style={{width:Math.max(0,Math.min(100,(model.roi||0)*100))+'%'}}/></i><b>{model.roi!=null?(model.roi*100).toFixed(2)+'%':'–'}</b></div><div className="scoreline"><span>Brier</span><i><em style={{width:model.brier_score!=null?Math.max(0,Math.min(100,(1-model.brier_score)*100)):0+'%'}}/></i><b>{model.brier_score!=null?Number(model.brier_score).toFixed(3):'–'}</b></div><div className="total">DATA + MODEL + RESULTAT <b>LIVE</b></div></section></div>}
function PageTitle({title,sub}){return <div className="sectionTitle"><span/>{title}<small>{sub||''}</small></div>}

function MatchesTable({matches,predictions,onSelect}){const matchList=asArray(matches);const predictionList=asArray(predictions);const by=new Map(predictionList.map(p=>[p.match_id,p]));return <div className="table panel"><div className="tr th"><span>TID</span><span>LIGA</span><span>KAMP</span><span>TIPS</span><span>AI %</span><span>ODDS</span><span>VERDI</span><span>STATUS</span></div>{matchList.map(m=>{const p=by.get(m.id);const kickoff=new Date(m.kickoff_at);const status=String(m.status||'').toLowerCase();const finished=status.includes('finish')||m.home_score!=null;const live=!finished&&kickoff.getTime()<=Date.now();return <button className="tr matchRow" key={m.id} onClick={()=>onSelect?.(m)}><span data-label="TID">{kickoff.toLocaleTimeString('nb-NO',{hour:'2-digit',minute:'2-digit'})}</span><span data-label="LIGA">{m.league||'–'}</span><span data-label="KAMP" className="matchCell">{m.home_team} – {m.away_team}</span><span data-label="TIPS" className="tipCell">{p?.prediction||'–'}</span><span data-label="AI %" className="greenTxt">{p?Math.round(Number(p.confidence||0))+'%':'–'}</span><span data-label="ODDS">{p?.odds?Number(p.odds).toFixed(2):'Ingen odds'}</span><span data-label="VERDI" className={p&&Number(p.value_percent)>0?'greenTxt':''}>{p?.value_percent!=null?Number(p.value_percent).toFixed(1)+'%':'–'}</span><span data-label="STATUS" className="status">{finished?'● '+(m.home_score??0)+'–'+(m.away_score??0):live?'● LIVE':'● Ikke startet'}</span></button>})}</div>}


function signalMatrix(prediction){const f=prediction?.feature_vector?.features||{};const rows=[['Hjemmeform',f.home_form],['Borteform',f.away_form],['Målforskjell hjemme',f.home_goal_diff],['Målforskjell borte',f.away_goal_diff],['Hjemme xG/proxy',f.home_xg_proxy],['Borte xG/proxy',f.away_xg_proxy],['Hjemmefordel',f.home_advantage]];return rows.filter(([,v])=>v!=null&&Number.isFinite(Number(v))).map(([label,v])=>({label,value:Number(v)})).slice(0,6)}
function MatchDetail({match,prediction,onClose}){const fv=prediction?.feature_vector||{};const f=fv.features||{};const meta=fv.metadata||{};const probs=fv.probabilities||{};const odds=fv.odds||{};const reasoning=prediction?.reasoning?.llm||prediction?.reasoning||{};const kickoff=match?new Date(match.kickoff_at):null;return <div className="detailOverlay" onClick={e=>e.target===e.currentTarget&&onClose()}><section className="matchDetail panel"><button className="detailClose" onClick={onClose}><X size={18}/></button><div className="detailEyebrow">TRADEMINDMZ · MATCH INTELLIGENCE</div><div className="detailLeague">{match.league||'Ukjent'} · {match.country||'Ukjent'}</div><div className="detailTeams"><div><small>HOME</small><strong>{match.home_team}</strong></div><div className="detailVs">VS<small>{kickoff?.toLocaleString('nb-NO',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</small></div><div><small>AWAY</small><strong>{match.away_team}</strong></div></div><div className="aiSignal"><div><small>AI PREDIKSJON</small><b>{prediction?.prediction||'Ingen prediksjon'}</b></div><div><small>CONFIDENCE</small><b className="greenTxt">{prediction?Number(prediction.confidence).toFixed(1)+'%':'–'}</b></div><div><small>ODDS</small><b>{prediction?.odds?Number(prediction.odds).toFixed(2):'Ingen odds'}</b></div><div><small>VALUE</small><b className={Number(prediction?.value_percent)>0?'greenTxt':''}>{prediction?.value_percent!=null?(Number(prediction.value_percent)>0?'+':'')+Number(prediction.value_percent).toFixed(1)+'%':'–'}</b></div></div><div className="detailCard" style={{marginTop:12}}><div className="detailTitle"><Activity/> MATCH STATUS</div><div className="signalRows"><span>Status <b>{match?.status||'–'}</b></span><span>Score <b>{match?.home_score!=null&&match?.away_score!=null?match.home_score+' – '+match.away_score:'–'}</b></span><span>Venue <b>{match?.venue||'–'}</b></span><span>Source <b>{match?.source||'Football data'}</b></span></div></div><div className="detailGrid"><section className="detailCard"><div className="detailTitle"><Brain/> AI ENGINE</div><div className="probBars">{[['Hjem',probs.home],['Uavgjort',probs.draw],['Borte',probs.away]].map(([label,v])=><div key={label}><span>{label}<b>{v!=null?(Number(v)*100).toFixed(1)+'%':'–'}</b></span><i><em style={{width:(v!=null?Number(v)*100:0)+'%'}}/></i></div>)}</div></section><section className="detailCard"><div className="detailTitle"><Activity/> DATA SIGNALS</div><div className="signalRows"><span>Home form <b>{f.home_form!=null?Number(f.home_form).toFixed(2):'–'}</b></span><span>Away form <b>{f.away_form!=null?Number(f.away_form).toFixed(2):'–'}</b></span><span>Home xG/proxy <b>{f.home_xg_proxy!=null?Number(f.home_xg_proxy).toFixed(2):'–'}</b></span><span>Away xG/proxy <b>{f.away_xg_proxy!=null?Number(f.away_xg_proxy).toFixed(2):'–'}</b></span><span>Data quality <b>{meta.data_quality!=null?(Number(meta.data_quality)*100).toFixed(0)+'%':'–'}</b></span></div></section><section className="detailCard"><div className="detailTitle"><TrendingUp/> MARKET</div><div className="signalRows"><span>Home odds <b>{odds.home?Number(odds.home).toFixed(2):'Ingen odds'}</b></span><span>Draw odds <b>{odds.draw?Number(odds.draw).toFixed(2):'Ingen odds'}</b></span><span>Away odds <b>{odds.away?Number(odds.away).toFixed(2):'Ingen odds'}</b></span><span>Odds source <b>{prediction?.reasoning?.odds_source||'–'}</b></span></div></section><section className="detailCard"><div className="detailTitle"><Zap/> AI REASONING</div><p className="reasoning">{reasoning?.summary||'Ingen ekstra AI reasoning er lagret for denne kampen.'}</p>{reasoning?.risk&&<div className="risk">RISK · {reasoning.risk}</div>}</section><section className="detailCard"><div className="detailTitle"><SlidersHorizontal/> SIGNAL MATRIX <small>LIVE FEATURES</small></div><div className="signalMatrix">{signalMatrix(prediction).map(s=><div className="matrixRow" key={s.label}><span>{s.label}</span><b>{s.value.toFixed(2)}</b></div>)}</div></section></div><div className="detailFooter"><span>MODEL <b>{prediction?.model_version||prediction?.model||'football-multinomial-v1'}</b></span><span>FEATURE VERSION <b>{prediction?.feature_version||'–'}</b></span><span>STATUS <b>{prediction?.status||match.status||'–'}</b></span></div></section></div>}

function AllMatchesPage({matches,predictions,onSelect}){const matchList=asArray(matches);const [country,setCountry]=useState('ALL'),[type,setType]=useState('ALL'),[league,setLeague]=useState('ALL');
  const countries=[...new Set(matchList.map(m=>m.country).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'nb'));
  const available=matchList.filter(m=>country==='ALL'||m.country===country);
  const competitions=[...new Set(available.filter(m=>type==='ALL'||m.competition_type===type).map(m=>m.league).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'nb'));
  const filtered=matchList.filter(m=>(country==='ALL'||m.country===country)&&(type==='ALL'||m.competition_type===type)&&(league==='ALL'||m.league===league));
  const clear=()=>{setCountry('ALL');setType('ALL');setLeague('ALL')};
  return <><PageTitle title="ALLE KAMPER" sub={filtered.length+' KAMPER VISES'}/><div className="matchFilters panel"><div className="filterHeading"><SlidersHorizontal size={15}/> FILTRER KAMPER <span>{filtered.length} treff</span></div><div className="filterControls"><label><small>LAND</small><select value={country} onChange={e=>{setCountry(e.target.value);setLeague('ALL')}}><option value="ALL">Alle land</option>{countries.map(c=><option key={c} value={c}>{c}</option>)}</select></label><label><small>TYPE</small><select value={type} onChange={e=>{setType(e.target.value);setLeague('ALL')}}><option value="ALL">Liga + cup</option><option value="league">Liga</option><option value="cup">Cup / turnering</option></select></label><label className="leagueFilter"><small>LIGA / CUP</small><select value={league} onChange={e=>setLeague(e.target.value)}><option value="ALL">Alle konkurranser</option>{competitions.map(l=><option key={l} value={l}>{l}</option>)}</select></label><button className="filterReset" onClick={clear}>NULLSTILL</button></div></div><MatchesTable matches={filtered} predictions={predictions} onSelect={onSelect}/></>}

function ValuePage({predictions,onSelect}){const predictionList=asArray(predictions);const values=predictionList.filter(p=>p.value_percent!=null&&Number(p.value_percent)>0&&Number(p.odds)>1).sort((a,b)=>Number(b.value_percent)-Number(a.value_percent));return <><PageTitle title="VALUE FINDER" sub="LIVE · POSITIVE VALUE"/><div className="pageGrid"><section className="panel"><div className="panelTitle"><Target/> POSITIVE VALUE <small>{values.length} FUNNET</small></div>{values.length?values.map(p=><button className="valueCard valueCardButton" key={p.id} onClick={()=>onSelect?.(p)}><div><b>{p.prediction}</b><small>AI {Number(p.confidence).toFixed(1)}% · Implied {p.implied_probability?Number(p.implied_probability).toFixed(1)+'%':'–'} · Odds {Number(p.odds).toFixed(2)}</small></div><strong className="greenTxt">+{Number(p.value_percent).toFixed(1)}%</strong></button>):<div className="emptyState">Ingen positiv value registrert akkurat nå.</div>}</section><section className="panel"><div className="panelTitle"><Brain/> HVORDAN VALUE BEREGNES</div><p className="pageText">Value viser modellens forventede avkastning mot tilgjengelig odds. Ingen odds betyr ingen Value Finder-score.</p><div className="formula">Value % = (modell-sannsynlighet × odds − 1) × 100</div></section></div></>}

function HistoryPage({history,onReload}){const s=history?.summary||{};return <><PageTitle title="HISTORIKK" sub="SISTE 30 DAGER"/><div className="metricGrid">{[['TIPS',s.total??0],['AVGJORTE',s.settled??0],['TREFFSIKKERHET',s.hit_rate!=null?Number(s.hit_rate).toFixed(1)+'%':'–'],['P&L',s.pnl!=null?Number(s.pnl).toFixed(2):'–']].map(([a,b])=><div className="metricCard" key={a}><small>{a}</small><strong>{b}</strong></div>)}</div><section className="panel"><div className="panelTitle"><Clock3/> RESULTATHISTORIKK <button className="miniBtn" onClick={onReload}>↻ OPPDATER</button></div><div className="historyList">{(history?.predictions||[]).slice(0,100).map(p=><div className="historyRow" key={p.id}><div><b>{p.match?.home_team||'–'} – {p.match?.away_team||'–'}</b><small>{p.match?.league||'–'} · {p.prediction} · Odds {p.odds?Number(p.odds).toFixed(2):'Ingen odds'}</small></div><span className={'badge '+String(p.status||'OPEN').toLowerCase()}>{p.status||'OPEN'}</span><strong className={Number(p.pnl)>0?'greenTxt':''}>{p.pnl!=null?Number(p.pnl).toFixed(2):'–'}</strong></div>)}</div></section></>}

function StatsPage({history,engine}){const s=history?.summary||{},m=history?.model||engine?.model||{};return <><PageTitle title="STATISTIKK" sub="DATA + RESULTATER"/><div className="metricGrid">{[['TREFFSIKKERHET',s.hit_rate!=null?Number(s.hit_rate).toFixed(1)+'%':'–'],['ROI',m.roi!=null?(Number(m.roi)*100).toFixed(2)+'%':'–'],['BRIER',m.brier_score!=null?Number(m.brier_score).toFixed(3):'–'],['LOG LOSS',m.log_loss!=null?Number(m.log_loss).toFixed(3):'–']].map(([a,b])=><div className="metricCard" key={a}><small>{a}</small><strong>{b}</strong></div>)}</div><div className="pageGrid"><section className="panel"><div className="panelTitle"><BarChart3/> LIGAOVERSIKT</div>{(history?.leagues||[]).map(l=><div className="dataStatusRow" key={l.league}><span>{l.league}</span><b>{l.wins}W · {l.losses}L · {Number(l.pnl).toFixed(2)}</b></div>)}{!history?.leagues?.length&&<div className="emptyState">Ingen avgjorte tips i perioden.</div>}</section><section className="panel"><div className="panelTitle"><Activity/> MODELLMÅLINGER</div><div className="dataStatusRow"><span>Treningsdata</span><b>{m.training_samples??0}</b></div><div className="dataStatusRow"><span>Modellversjon</span><b>{m.model_version||'–'}</b></div><div className="dataStatusRow"><span>Oppdatert</span><b>{m.updated_at?new Date(m.updated_at).toLocaleString('nb-NO'):'–'}</b></div></section></div></>}

function ModelPage({engine,history,learning,validation,onTrain}){const m=history?.model||engine?.model||{};const l=learning?.learning||{};const v=validation?.summary||{};const b=validation?.breakdowns||{};const renderRows=(key)=>asArray(b[key]).slice(0,8).map(x=><div className="dataStatusRow" key={x.key}><span>{x.key}</span><b>{x.samples} · {x.accuracy!=null?(Number(x.accuracy)*100).toFixed(1)+'%':'–'} · P&L {Number(x.pnl||0).toFixed(2)}</b></div>);return <><PageTitle title="MODEL LAB" sub="LIVE LÆRING + VALIDERING"/><div className="metricGrid">{[['EVALUERTE',l.evaluated??0],['WON',l.wins??0],['LOST',l.losses??0],['VOID',l.voids??0],['TREFFSIKKERHET',l.accuracy!=null?(Number(l.accuracy)*100).toFixed(1)+'%':'–'],['ROI',m.roi!=null?(Number(m.roi)*100).toFixed(2)+'%':'–']].map(([a,b])=><div className="metricCard" key={a}><small>{a}</small><strong>{b}</strong></div>)}</div><section className="panel"><div className="panelTitle"><FlaskConical/> LÆRINGSMODELL <button className="miniBtn" onClick={onTrain}>↻ TREN MODELL</button></div><p className="pageText">Modellen trener kun på avgjorte WON/LOST-resultater. VOID brukes i datakvalitet, men påvirker ikke trening eller treffsikkerhet.</p><div className="pipelineLarge">{['FORM','xG/PROXY','RESULTATER','ODDS','PROBABILITY','VALUE','EVALUERING','LÆRING','RETRAIN','VALIDERING'].map((x,i)=><span key={x} className={i<9?'done':''}>{i+1}. {x}</span>)}</div></section><section className="pageGrid"><section className="panel"><div className="panelTitle"><BarChart3/> VALIDERING · SISTE 90 DAGER</div><div className="dataStatusRow"><span>Avgjorte</span><b>{v.settled??0}</b></div><div className="dataStatusRow"><span>Treffsikkerhet</span><b>{v.accuracy!=null?(Number(v.accuracy)*100).toFixed(1)+'%':'–'}</b></div><div className="dataStatusRow"><span>ROI / tips</span><b>{v.roi!=null?(Number(v.roi)*100).toFixed(2)+'%':'–'}</b></div><div className="dataStatusRow"><span>Brier</span><b>{v.brier_score!=null?Number(v.brier_score).toFixed(3):'–'}</b></div><div className="dataStatusRow"><span>Log loss</span><b>{v.log_loss!=null?Number(v.log_loss).toFixed(3):'–'}</b></div></section><section className="panel"><div className="panelTitle"><Database/> PER LIGA</div>{renderRows('league')}{!asArray(b.league).length&&<div className="emptyState">Ingen valideringsdata ennå.</div>}</section></section><section className="pageGrid"><section className="panel"><div className="panelTitle"><Activity/> CONFIDENCE / ODDS</div>{renderRows('confidence')}{renderRows('odds')}{!asArray(b.confidence).length&&!asArray(b.odds).length&&<div className="emptyState">Ingen valideringsdata ennå.</div>}</section><section className="panel"><div className="panelTitle"><Target/> VALUE / PERIODE</div>{renderRows('value')}{renderRows('period')}{!asArray(b.value).length&&!asArray(b.period).length&&<div className="emptyState">Ingen valideringsdata ennå.</div>}</section></section></>}

const AI_FEATURES=[
  ["home_form","Hjemmeform"],
  ["away_form","Borteform"],
  ["home_goal_diff","Hjemme målforskjell"],
  ["away_goal_diff","Borte målforskjell"],
  ["home_attack","Hjemme angrep"],
  ["away_attack","Borte angrep"],
  ["home_defense","Hjemme forsvar"],
  ["away_defense","Borte forsvar"],
  ["goal_diff_edge","Målforskjell edge"],
  ["position_edge","Tabellposisjon"],
  ["travel_load","Reisebelastning"],
  ["home_xg_proxy","Hjemme xG/proxy"],
  ["away_xg_proxy","Borte xG/proxy"],
  ["home_advantage","Hjemmefordel"],
];

function outcomeLabel(outcome){
  return outcome==="home"?"HJEMME":outcome==="away"?"BORTE":"UAVGJORT";
}
function featureLabel(name){
  return AI_FEATURES.find(([key])=>key===name)?.[1]||name.replaceAll("_"," ");
}
function selectedOutcome(p){
  if(p?.selected_outcome) return p.selected_outcome;
  const text=String(p?.prediction||"").toLowerCase();
  if(text.includes("uavgjort")||text.includes("draw")) return "draw";
  if(p?.match?.away_team&&text.includes(String(p.match.away_team).toLowerCase())) return "away";
  return "home";
}
function featureImpactRows(p,model){
  const outcome=selectedOutcome(p);
  const features=p?.feature_vector?.features||{};
  const weights=model?.weights?.[outcome]||[];
  return AI_FEATURES.map(([key],i)=>({
    key,label:featureLabel(key),
    value:Number(features[key]||0),
    weight:Number(weights[i]||0),
    impact:Number(features[key]||0)*Number(weights[i]||0),
  })).filter(x=>Number.isFinite(x.impact)).sort((a,b)=>Math.abs(b.impact)-Math.abs(a.impact)).slice(0,8);
}

function AiAnalysisPage({predictions,engine,onSelectMatch}){
  const rows=asArray(predictions).slice(0,20);
  const model=engine?.model||{};
  const focus=rows[0];
  const impacts=focus?featureImpactRows(focus,model):[];
  const maxImpact=Math.max(0,...impacts.map(x=>Math.abs(x.impact)));
  const weightRows=AI_FEATURES.map(([key,label],i)=>({
    key,label,
    home:Number(model?.weights?.home?.[i]||0),
    draw:Number(model?.weights?.draw?.[i]||0),
    away:Number(model?.weights?.away?.[i]||0),
  }));
  return <>
    <PageTitle title="AI ANALYSE" sub="LIVE INTELLIGENCE CENTER"/>
    <section className="aiTerminal panel">
      <div className="aiTerminalTop">
        <div>
          <div className="terminalEyebrow"><span/> ENGINE ONLINE · FEATURE-V1</div>
          <h2>MODELLENS <em>INTELLIGENCE CENTER</em></h2>
          <p>Sanntidsvisning av signaler, modellvekter, sannsynlighet og AI-reasoning.</p>
        </div>
        <div className="terminalStats">
          <span><small>MODEL</small><b>{model.model_version||"football-multinomial-v1"}</b></span>
          <span><small>TRAINING</small><b>{model.training_samples??0}</b></span>
          <span><small>UPDATED</small><b>{model.updated_at?new Date(model.updated_at).toLocaleTimeString("nb-NO",{hour:"2-digit",minute:"2-digit"}):"–"}</b></span>
        </div>
      </div>

      {focus ? <div className="aiIntelGrid">
        <section className="intelCard focusCard">
          <div className="intelLabel"><Brain/> ACTIVE SIGNAL</div>
          <div className="focusMatch">
            <div><small>KAMP</small><b>{focus.match?.home_team||"–"} <span>vs</span> {focus.match?.away_team||"–"}</b><p>{focus.match?.league||"Ukjent"} · {focus.match?.country||"Ukjent"}</p></div>
            <div className="focusOutcome"><small>MODEL OUTPUT</small><strong>{outcomeLabel(selectedOutcome(focus))}</strong><b>{Number(focus.confidence||0).toFixed(1)}%</b></div>
          </div>
          <div className="probMatrix">
            {["home","draw","away"].map(k=><div key={k}><span>{outcomeLabel(k)}<b>{focus.feature_vector?.probabilities?.[k]!=null?(Number(focus.feature_vector.probabilities[k])*100).toFixed(1)+"%":"–"}</b></span><i><em style={{width:(focus.feature_vector?.probabilities?.[k]!=null?Number(focus.feature_vector.probabilities[k])*100:0)+"%"}}/></i></div>)}
          </div>
          <div className="signalFoot"><span>ODDS <b>{focus.odds?Number(focus.odds).toFixed(2):"Ingen odds"}</b></span><span>VALUE <b className={Number(focus.value_percent)>0?"greenTxt":""}>{focus.value_percent!=null?(Number(focus.value_percent)>0?"+":"")+Number(focus.value_percent).toFixed(1)+"%":"–"}</b></span><span>DATA <b>{focus.feature_vector?.metadata?.data_quality!=null?(Number(focus.feature_vector.metadata.data_quality)*100).toFixed(0)+"%":"–"}</b></span></div><div className="signalFoot signalFootExtra"><span>MODEL <b>{focus.model_version||model.model_version||"–"}</b></span><span>FEATURE <b>{focus.feature_version||"–"}</b></span><span>STATUS <b>{focus.status||"OPEN"}</b></span></div><div className="signalConfidence"><span>CONFIDENCE BAND</span><div><i><em style={{width:Math.min(100,Math.max(0,Number(focus.confidence||0)))+"%"}}/></i><b>{Number(focus.confidence||0).toFixed(1)}%</b></div></div>
        </section>

        <section className="intelCard">
          <div className="intelLabel"><Activity/> FEATURE IMPACT <small>· {outcomeLabel(selectedOutcome(focus))}</small></div>
          <div className="impactList">{impacts.map(x=><div className="impactRow" key={x.key}>
            <div><span>{x.label}</span><small>{x.value.toFixed(2)} × {x.weight.toFixed(2)}</small></div>
            <i><em className={x.impact>=0?"positive":"negative"} style={{width:(maxImpact?Math.max(8,Math.abs(x.impact)/maxImpact*100):0)+"%"}}/></i>
            <b className={x.impact>=0?"greenTxt":"negativeTxt"}>{x.impact>=0?"+":""}{x.impact.toFixed(3)}</b>
          </div>)}</div>
        </section>
      </div> : <div className="emptyState">Ingen live-prediksjoner tilgjengelig.</div>}

      <div className="aiIntelLower">
        <section className="intelCard">
          <div className="intelLabel"><SlidersHorizontal/> MODEL WEIGHTS <small>· MULTINOMIAL</small></div>
          <div className="weightsTable">
            <div className="weightsHead"><span>FEATURE</span><span>HJEMME</span><span>UAVGJORT</span><span>BORTE</span></div>
            {weightRows.map(x=><div className="weightsRow" key={x.key}><span>{x.label}</span><b className={x.home>=0?"greenTxt":"negativeTxt"}>{x.home.toFixed(2)}</b><b className={x.draw>=0?"greenTxt":"negativeTxt"}>{x.draw.toFixed(2)}</b><b className={x.away>=0?"greenTxt":"negativeTxt"}>{x.away.toFixed(2)}</b></div>)}
          </div>
        </section>

        <section className="intelCard reasoningCard">
          <div className="intelLabel"><Zap/> AI REASONING STREAM</div>
          <div className="reasoningStream">{rows.slice(0,8).map((p,i)=><button className="reasoningItem" key={p.id} onClick={()=>onSelectMatch?.(p.match_id)}>
            <span className="streamDot">{String(i+1).padStart(2,"0")}</span>
            <div><b>{p.prediction||"–"}</b><small>{p.match_id?.slice?.(0,8)||"MATCH"} · {Number(p.confidence||0).toFixed(1)}% · {p.value_percent!=null?(Number(p.value_percent)>0?"+":"")+Number(p.value_percent).toFixed(1)+"% value":"no value"}</small><p>{p.reasoning?.llm?.summary||"Modellbasert vurdering fra live feature-sett."}</p></div>
          </button>)}{!rows.length&&<div className="emptyState">Ingen reasoning tilgjengelig.</div>}</div>
        </section>
      </div>
    </section>
  </>;
}

function ExpertPage(){return <><PageTitle title="EKSPERTANALYSE" sub="EKSTERNE EKSPERTDATA"/><section className="panel"><div className="panelTitle"><Newspaper/> EKSPERTDATA</div><div className="emptyState">Ingen verifisert ekspertkilde er koblet til akkurat nå. Appen viser derfor ikke oppdiktede ekspertuttalelser eller nyheter.</div></section></>}

function SettingsPage(){
  const [diag,setDiag]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const runDiagnostics=async()=>{
    setLoading(true);setError('');
    try{const data=await getFootballDiagnostics();setDiag(data);if(!data?.ok)setError('Én eller flere backend-tester feilet. Se detaljene under.');}
    catch(e){setError(e?.message||'Kunne ikke kjøre backend-testen.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{runDiagnostics()},[]);
  const checks=diag?.checks&&typeof diag.checks==='object'?Object.entries(diag.checks):[];
  const label={database:'DATABASE',football_api:'FOOTBALL SOCCER API',api_football_odds:'API-FOOTBALL ODDS',model:'AI-MODELL'};
  return <><PageTitle title="INNSTILLINGER" sub="SYSTEM + API HEALTH"/>
    <div className="pageGrid">
      <section className="panel">
        <div className="panelTitle"><Settings/> SYSTEM</div>
        <div className="dataStatusRow"><span>Fotballområde</span><b>Europa</b></div><div className="dataStatusRow"><span>Datakilde</span><b>Football Soccer API</b></div>
        <div className="dataStatusRow"><span>Backend</span><b>Supabase Edge Function</b></div>
        <div className="dataStatusRow"><span>Modell</span><b>Multinomial AI</b></div>
        <div className="dataStatusRow"><span>Persistens</span><b>Supabase</b></div>
        <div className="healthHeader"><div><small>BACKEND HEALTH</small><strong className={diag?.ok?'greenTxt':'negativeTxt'}>{loading?'TESTER…':diag?.ok?'ALL SYSTEMS READY':'ATTENTION NEEDED'}</strong></div><button className="miniBtn" onClick={runDiagnostics} disabled={loading}>{loading?'TESTER…':'↻ KJØR TEST'}</button></div>
        {error&&<div className="healthError">{error}</div>}
        <div className="healthGrid">
          {checks.map(([key,value])=><div className={'healthCard '+(value?.ok?'ok':'fail')} key={key}>
            <div><span>{value?.ok?'✓':'!'}</span><b>{label[key]||key}</b></div>
            <small>{value?.ms!=null?value.ms+' ms':'–'}</small>
            <p>{value?.ok?(value?.result?.skipped?'Ikke konfigurert – hoppet over':'Tilkobling OK'):String(value?.error||'Test feilet').includes('quota_exhausted')?'Daglig kvote brukt opp – API-et er midlertidig begrenset.':'Test feilet'}</p>
          </div>)}
        </div>
        {diag?.checked_at&&<div className="healthFooter">Sist kontrollert {new Date(diag.checked_at).toLocaleString('nb-NO')} · {diag.duration_ms} ms totalt</div>}
      </section>
      <section className="panel">
        <div className="panelTitle"><ShieldAlert/> DATAPRINSIPPER</div>
        <p className="pageText">Ingen demo-tips brukes når live-data mangler. Skade- og xG-data vises bare når leverandøren faktisk leverer dem.</p>
        <div className="dataStatusRow"><span>API-helsesjekk</span><b>{diag?.status||'CHECKING'}</b></div>
        <div className="dataStatusRow"><span>Backend-endepunkt</span><b>football-ai</b></div>
        <div className="dataStatusRow"><span>Diagnostikk</span><b>{checks.length?checks.filter(([,v])=>v?.ok).length+'/'+checks.length:'–'}</b></div>
      </section>
    </div>
  </>;
}

function MobileNav({active,setActive}){const items=[["Hjem",Home],["Alle kamper",Globe2],["AI analyse",Brain],["Statistikk",BarChart3],["Value Finder",Target]];return <nav className="mobileNav">{items.map(([label,Icon])=><button key={label} className={active===label?"active":""} onClick={()=>setActive(label)}><Icon size={19}/><span>{label==="Alle kamper"?"Kamper":label==="Value Finder"?"Value":label.replace(" analyse","")}</span></button>)}</nav>}

function HomePage({matchList,predictionList,realPicks,setSelectedMatch}){
  const picks=realPicks.slice(0,3).map((x,i)=>({match:x.match,prediction:x.prediction,index:i,time:new Date(x.match.kickoff_at).toLocaleTimeString('nb-NO',{hour:'2-digit',minute:'2-digit'})}));
  const featured=picks[0], more=picks.slice(1,3);
  const countries=['ALLE','NORGE','ENGLAND','SPANIA','ITALIA','TYSKLAND'];
  const [country,setCountry]=useState('ALLE');
  const filtered=matchList.filter(m=>country==='ALLE'||String(m.country||'').toUpperCase().includes(country)).slice(0,8);
  const renderTeam=name=>String(name||'').slice(0,3).toUpperCase();
  const confidence=p=>Math.round(Number(p?.confidence||0));
  const odds=p=>p?.odds&&Number(p.odds)>1?Number(p.odds).toFixed(2):'Ingen odds';
  return <div className="homeV2">
    <section className="homeQuickStats"><div><span>⚽</span><b>{matchList.length}</b><small>KAMPER</small></div><div><span>♧</span><b>{predictionList.length}</b><small>AI-ANALYSER</small></div><button className="homeRegion"><span>🇪🇺</span><b>EUROPA</b><ChevronRight size={17}/></button></section>
    {featured&&<section className="homeFeatured"><div className="homeSectionHead"><h2>🏆 DAGENS BESTE TIPS</h2><span>{confidence(featured.prediction)>=70?'STERKT SIGNAL':'MODERAT SIGNAL'}</span></div>
      <button className="homeFeaturedCard" onClick={()=>setSelectedMatch(featured.match)}>
        <div className="homeMatchHero"><div><div className="homeCrest">{renderTeam(featured.match.home_team)}</div><strong>{featured.match.home_team}</strong></div><div className="homeVs"><small>{featured.match.league||'Europa'} · I DAG · {featured.time}</small><b>VS</b></div><div><div className="homeCrest away">{renderTeam(featured.match.away_team)}</div><strong>{featured.match.away_team}</strong></div></div>
        <div className="homeMetrics"><div><small>AI SJANSE</small><b className="greenTxt">{confidence(featured.prediction)}%</b></div><div><small>ODDS</small><b>{odds(featured.prediction)}</b></div><div><small>VERDI</small><b className={Number(featured.prediction?.value_percent)>0?'greenTxt':''}>{featured.prediction?.value_percent!=null?Number(featured.prediction.value_percent).toFixed(1)+'%':'–'}</b></div></div>
        <div className="homeSignals"><span>▥ Form</span><span>⚽ Resultater</span><span>⌁ xG</span><span>◈ Lagstyrke</span></div><div className="homeAnalyse">SE FULL ANALYSE <ChevronRight size={17}/></div>
      </button>
    </section>}
    {more.length>0&&<section className="homeMore"><div className="homeListHead"><h2>⭐ FLERE GODE TIPS</h2><button onClick={()=>setSelectedMatch(more[0].match)}>SE ALLE <ChevronRight size={16}/></button></div><div className="homeMiniGrid">{more.map(x=><button className="homeMiniCard" key={x.match.id} onClick={()=>setSelectedMatch(x.match)}><div className="homeMiniTop"><b>#{x.index+1}</b><span>{confidence(x.prediction)>=70?'STERKT':'MODERAT'}</span></div><div className="homeMiniTeams"><div><i>{renderTeam(x.match.home_team)}</i><b>{x.match.home_team}</b></div><small>{x.time}<br/>{x.match.league||'Europa'}<br/><strong>VS</strong></small><div><i>{renderTeam(x.match.away_team)}</i><b>{x.match.away_team}</b></div></div><div className="homeMiniMeta"><span>AI <b>{confidence(x.prediction)}%</b></span><span>Odds <b>{odds(x.prediction)}</b></span></div></button>)}</div></section>}
    <section className="homeUpcoming"><div className="homeListHead"><h2>▣ KOMMENDE KAMPER</h2><button>SE ALLE <ChevronRight size={16}/></button></div><div className="homeCountryFilters">{countries.map(x=><button key={x} className={country===x?'active':''} onClick={()=>setCountry(x)}>{x}</button>)}</div><div className="homeMatchList">{filtered.map(m=>{const p=predictionList.find(x=>x.match_id===m.id);return <button key={m.id} onClick={()=>setSelectedMatch(m)}><span>{new Date(m.kickoff_at).toLocaleTimeString('nb-NO',{hour:'2-digit',minute:'2-digit'})}</span><b>{m.home_team} – {m.away_team}</b><small>{m.league||'Europa'}</small><strong>{p?confidence(p)+'%':'–'}</strong><ChevronRight size={16}/></button>})}</div></section>
  </div>
}

function Main(){
  const [active,setActive]=useState('Hjem'),[mobile,setMobile]=useState(false),[liveMatches,setLiveMatches]=useState([]),[livePredictions,setLivePredictions]=useState([]),[engine,setEngine]=useState({}),[syncing,setSyncing]=useState(false),[liveError,setLiveError]=useState(''),[history,setHistory]=useState(null),[learning,setLearning]=useState(null),[historyLoading,setHistoryLoading]=useState(false),[selectedMatch,setSelectedMatch]=useState(null);

  const loadLive=async()=>{try{const data=await getFootballDashboard();if(data?.ok){setLiveMatches(asArray(data.matches));setLivePredictions(asArray(data.predictions));setEngine(data.engine&&typeof data.engine==='object'?data.engine:{});setLiveError('')}}catch(e){setLiveError(e?.message||'Live-data ikke tilgjengelig')}};
  const loadHistory=async()=>{setHistoryLoading(true);try{const d=await getFootballHistory();if(d?.ok)setHistory(d)}catch(e){setLiveError(e?.message||'Historikk ikke tilgjengelig')}finally{setHistoryLoading(false)}};
  useEffect(()=>{loadLive()},[]);
  const loadLearning=async()=>{try{const d=await getFootballLearning();if(d?.ok)setLearning(d)}catch{}};
  const loadValidation=async()=>{try{const d=await getFootballValidation();if(d?.ok)setValidation(d)}catch{}};
  useEffect(()=>{if(['Historikk','Statistikk','Model Lab'].includes(active)&&!history&&!historyLoading)loadHistory()},[active]);
  useEffect(()=>{if(active==='Model Lab'){loadLearning();loadValidation()}},[active]);

  const handleSync=async()=>{setSyncing(true);setLiveError('');try{await syncFootballData();await loadLive();if(history)await loadHistory()}catch(e){setLiveError(e?.message||'Kunne ikke synkronisere live-data')}finally{setSyncing(false)}};
  const handleTrain=async()=>{setHistoryLoading(true);try{const r=await trainFootballModel();if(!r.ok)throw new Error('Modelltrening feilet');await loadLive();await loadHistory();await loadLearning();await loadValidation()}catch(e){setLiveError(e?.message||'Modelltrening feilet')}finally{setHistoryLoading(false)}};

  const matchList=asArray(liveMatches);const predictionList=asArray(livePredictions);const predictionByMatch=new Map(predictionList.map(p=>[p.match_id,p]));
  const realPicks=matchList.map(m=>({match:m,prediction:predictionByMatch.get(m.id)})).filter(x=>x.prediction).slice(0,2);
  const displayPicks=realPicks.map(x=>({league:x.match.league,time:new Date(x.match.kickoff_at).toLocaleTimeString('nb-NO',{hour:'2-digit',minute:'2-digit'}),home:x.match.home_team,away:x.match.away_team,homeShort:x.match.home_team.slice(0,3).toUpperCase(),awayShort:x.match.away_team.slice(0,3).toUpperCase(),tip:x.prediction.prediction,confidence:Number(x.prediction.confidence||0),odds:x.prediction.odds?Number(x.prediction.odds).toFixed(2):'Ingen odds',signal:Number(x.prediction.confidence||0)>=70?'STARKT SIGNAL':'MODERAT SIGNAL',value:Number(x.prediction.value_percent||0)>10?'++':'+',valuePercent:x.prediction.value_percent,reasons:['Modell: '+(x.prediction.model||'Football AI'),'Sannsynlighet: '+Number(x.prediction.confidence||0).toFixed(1)+'%', 'Value: '+(x.prediction.value_percent!=null?Number(x.prediction.value_percent).toFixed(1)+'%':'ikke tilgjengelig'),x.prediction.reasoning?.llm?.summary||('Datakilde: '+(x.prediction.provider||'live'))]}));
  const page=active==='Hjem'?<HomePage matchList={matchList} predictionList={predictionList} realPicks={realPicks} setSelectedMatch={setSelectedMatch}/>
  :active==='AI Tips'?<><PageTitle title="AI TIPS" sub="KOMMENDE 2 DAGER"/><div className="picks pagePicks">{displayPicks.map((p,i)=><PickCard key={p.home+p.away} p={p} index={i} onAnalyse={()=>{const x=realPicks[i];if(x?.match)setSelectedMatch(x.match)}}/>)}</div></>
  :active==='Alle kamper'?<AllMatchesPage matches={matchList} predictions={predictionList} onSelect={setSelectedMatch}/>
  :active==='Value Finder'?<ValuePage predictions={predictionList} onSelect={(p)=>{const m=matchList.find(x=>x.id===p.match_id);if(m)setSelectedMatch(m)}}/>
  :active==='Historikk'?<HistoryPage history={history} onReload={loadHistory}/>
  :active==='Statistikk'?<StatsPage history={history} engine={engine}/>
  :active==='Model Lab'?<ModelPage history={history} engine={engine} learning={learning} validation={validation} onTrain={handleTrain}/>
   :active==='AI analyse'?<AiAnalysisPage predictions={predictionList} engine={engine} onSelectMatch={(id)=>{const m=matchList.find(x=>x.id===id);if(m)setSelectedMatch(m)}}/>
  :active==='Ekspertanalyse'?<ExpertPage/>
  :<SettingsPage/>;

  return <div className="app"><Sidebar active={active} setActive={setActive} mobile={mobile} setMobile={setMobile}/><main><Header setMobile={setMobile} onSync={handleSync} syncing={syncing}/>{active!=='Hjem'&&<StatBar matches={matchList.length} predictions={predictionList.length} engine={engine}/>} {liveError&&<div className="liveNotice">LIVE-DATA: {liveError}</div>}{page}<MobileNav active={active} setActive={setActive}/>{selectedMatch&&<MatchDetail match={selectedMatch} prediction={predictionByMatch.get(selectedMatch.id)} onClose={()=>setSelectedMatch(null)}/>}</main></div>
}


class AppErrorBoundary extends React.Component{
  constructor(props){
    super(props);
    this.state={error:null};
  }
  static getDerivedStateFromError(error){
    return {error};
  }
  componentDidCatch(error,info){
    console.error("TradeMindMZ render error",error,info);
  }
  handleReload=()=>{
    try{window.location.reload()}catch{}
  };
  render(){
    if(this.state.error){
      return <div className="runtimeError">
        <div className="runtimeErrorCard">
          <div className="runtimeErrorLogo">MZ</div>
          <h1>TRADEMINDMZ</h1>
          <strong>Appen fikk en midlertidig feil</strong>
          <p>{this.state.error?.message||String(this.state.error)}</p>
          <button onClick={this.handleReload}>LAST INN APPEN PÅ NYTT</button>
        </div>
      </div>;
    }
    return this.props.children;
  }
}

function AppRuntimeGuard({children}){
  const [error,setError]=useState(null);
  useEffect(()=>{
    window.__tmBooted=true;
    const onError=(event)=>{
      // Ignore browser resource errors (images/fonts/etc.). React ErrorBoundary handles render failures.
      if(!event?.error)return;
      const message=event.error?.message||'Ukjent app-feil';
      console.error('TradeMindMZ global error',event.error);
      setError(String(message));
    };
    const onRejection=(event)=>{
      const reason=event?.reason;
      if(reason?.name==='AbortError')return;
      const message=reason?.message||String(reason||'Ukjent Promise-feil');
      console.error('TradeMindMZ unhandled rejection',reason);
      setError(message);
    };
    window.addEventListener('error',onError);
    window.addEventListener('unhandledrejection',onRejection);
    return()=>{window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onRejection)};
  },[]);
  if(error)return <div className="runtimeError"><div className="runtimeErrorCard"><div className="runtimeErrorLogo">MZ</div><h1>TRADEMINDMZ</h1><strong>Appen fikk en midlertidig feil</strong><p>{error}</p><button onClick={()=>window.location.reload()}>LAST INN APPEN PÅ NYTT</button></div></div>;
  return children;
}

try{
  createRoot(document.getElementById('root')).render(
  <AppErrorBoundary>
    <AppRuntimeGuard><Main/></AppRuntimeGuard>
  </AppErrorBoundary>
);
}catch(error){
  const root=document.getElementById('root');
  if(root)root.innerHTML='<div class="runtimeError"><div class="runtimeErrorCard"><div class="runtimeErrorLogo">MZ</div><h1>TRADEMINDMZ</h1><strong>Kunne ikke starte appen</strong><p>'+String(error?.message||error)+'</p><button onclick="location.reload()">LAST INN APPEN PÅ NYTT</button></div></div>';
}
