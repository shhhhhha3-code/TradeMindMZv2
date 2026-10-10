import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SUPABASE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||Deno.env.get("SUPABASE_SECRET_KEY")||Deno.env.get("SUPABASE_ANON_KEY")||"";
const sb=createClient(SUPABASE_URL||"https://missing-config.supabase.co",SUPABASE_KEY||"missing-config-key");
const EUROPE=new Set(["Albania","Andorra","Armenia","Austria","Azerbaijan","Belarus","Belgium","Bosnia","Bosnia and Herzegovina","Bulgaria","Croatia","Cyprus","Czech Republic","Czechia","Denmark","England","Estonia","Faroe Islands","Finland","France","Georgia","Germany","Gibraltar","Greece","Hungary","Iceland","Ireland","Italy","Kazakhstan","Kosovo","Latvia","Liechtenstein","Lithuania","Luxembourg","Malta","Moldova","Monaco","Montenegro","Netherlands","North Macedonia","Northern Ireland","Norway","Poland","Portugal","Romania","Russia","San Marino","Scotland","Serbia","Slovakia","Slovenia","Spain","Sweden","Switzerland","Turkey","Ukraine","Wales","United Kingdom","Republic of Ireland"]);
const VOID=new Set(["cancelled","canceled","postponed","abandoned","suspended"]);
const out=(status:number,data:any,requestId=crypto.randomUUID())=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","access-control-allow-origin":"*","access-control-allow-headers":"authorization,apikey,content-type,x-client-info","access-control-allow-methods":"POST,OPTIONS","x-request-id":requestId}});
const norm=(s:any)=>String(s||"").toLowerCase().normalize("NFKD").replace(/[\\u0300-\\u036f]/g,"").replace(/[^a-z0-9 ]/g," ").replace(/\\s+/g," ").trim();
const european=(m:any)=>{const c=String(m.raw?.country||m.country||"");const league=String(m.league||"");const lc=league.split(" · ")[0];const text=league+" "+String(m.type||m.raw?.type||"");const uefa=/uefa\s+(champions league|europa league|conference league|europa conference league|nations league|super cup)/i.test(league);const sportmonksEurope=lc==="Europe";return(EUROPE.has(c)||EUROPE.has(lc)||sportmonksEurope||uefa)&&!/friendly|test match/i.test(text)};
const softmax=(a:number[])=>{const mx=Math.max(...a),e=a.map(x=>Math.exp(x-mx)),s=e.reduce((a,b)=>a+b,0);return e.map(x=>x/s)};
async function getSettings(){try{const {data}=await sb.from("football_ai_settings").select("*").eq("id",true).maybeSingle();if(data)return data}catch{}return{football_api_enabled:true,odds_api_enabled:true,groq_enabled:true,openai_enabled:true}}
const osloDate=(d:Date)=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Oslo",year:"numeric",month:"2-digit",day:"2-digit"}).format(d);const nextOsloDate=(date:string)=>{const [y,m,day]=date.split("-").map(Number);return osloDate(new Date(Date.UTC(y,m-1,day+1,12,0,0)))};const osloMidnight=(date:string)=>{const [y,m,day]=date.split("-").map(Number);const guess=Date.UTC(y,m-1,day);const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Europe/Oslo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(new Date(guess));const p=(type:string)=>Number(parts.find(x=>x.type===type)?.value||0);const wall=Date.UTC(p("year"),p("month")-1,p("day"),p("hour"),p("minute"),p("second"));return new Date(guess-(wall-guess))};const todayBounds=()=>{const date=osloDate(new Date());const start=osloMidnight(date);const tomorrow=nextOsloDate(date);return{date,start,end:osloMidnight(tomorrow)}};async function getMatches(){const {start,end}=todayBounds();const {data,error}=await sb.from("football_matches").select("*").gte("kickoff_at",start.toISOString()).lt("kickoff_at",end.toISOString()).order("kickoff_at").limit(1000);if(error)throw error;return data||[]}
async function getStats(){const {data,error}=await sb.from("football_team_stats").select("*").limit(5000);if(error)throw error;return data||[]}
async function getHistoricalMatches(){
  const {data,error}=await sb.from("football_matches").select("*").order("kickoff_at",{ascending:false}).limit(20000);
  if(error)throw error;
  return data||[];
}
function homeAwayIntelligence(teamName:string,venue:"HOME"|"AWAY",stats:any[],matches:any[]){
  const key=norm(teamName), now=Date.now();
  const relevant=(matches||[]).filter((m:any)=>{
    const home=norm(m.home_team)===key,away=norm(m.away_team)===key;
    if(venue==="HOME"&&!home)return false;
    if(venue==="AWAY"&&!away)return false;
    if(!home&&!away)return false;
    if(VOID.has(String(m.status||"").toLowerCase()))return false;
    const hs=Number(m.home_score),as=Number(m.away_score);
    return Number.isFinite(hs)&&Number.isFinite(as)&&new Date(m.kickoff_at).getTime()<=now;
  }).slice(0,16);
  if(!relevant.length)return null;
  let weightSum=0,points=0,goalDiff=0,xgDiff=0,xgWeight=0,oppStrength=0;
  for(const m of relevant){
    const isHome=norm(m.home_team)===key, opponent=isHome?m.away_team:m.home_team;
    const ageDays=Math.max(0,(now-new Date(m.kickoff_at).getTime())/86400000);
    const recency=Math.exp(-ageDays/75);
    const hs=Number(m.home_score),as=Number(m.away_score);
    const gf=venue==="HOME"?hs:as,ga=venue==="HOME"?as:hs;
    const pts=gf>ga?3:gf===ga?1:0;
    const os=stats.find((x:any)=>norm(x.team_name)===norm(opponent));
    const strength=os?(Number(os.wins||0)-Number(os.losses||0)+.35*(Number(os.goals_for||0)-Number(os.goals_against||0))+.45*(Number(os.xg_for||0)-Number(os.xg_against||0))):0;
    weightSum+=recency; points+=pts*recency; goalDiff+=(gf-ga)*recency; oppStrength+=strength*recency;
    const hx=Number(m.home_xg),ax=Number(m.away_xg);
    if(Number.isFinite(hx)&&Number.isFinite(ax)){xgDiff+=(venue==="HOME"?hx-ax:ax-hx)*recency;xgWeight+=recency;}
  }
  const avg=(v:number)=>weightSum?v/weightSum:0;
  const pointsRate=avg(points)/3*100;
  const gd=Math.max(0,Math.min(100,50+avg(goalDiff)*13));
  const xg=xgWeight?Math.max(0,Math.min(100,50+(xgDiff/xgWeight)*13)):50;
  const opp=Math.max(0,Math.min(100,50+avg(oppStrength)*2));
  const score=Math.max(0,Math.min(100,pointsRate*.45+gd*.20+xg*.20+opp*.15));
  return{score:Math.round(score),points_rate:Math.round(pointsRate),goal_diff:Number(avg(goalDiff).toFixed(2)),xg_diff:xgWeight?Number((xgDiff/xgWeight).toFixed(2)):null,opponent_strength:Math.round(opp),sample_size:relevant.length,venue,recency_method:"exp_decay_75d"};
}
function poisson(lambda:number,k:number){return Math.exp(-lambda)*Math.pow(lambda,k)/factorial(k)}
function factorial(n:number){let v=1;for(let i=2;i<=n;i++)v*=i;return v}
function marketProbabilities(homeProb:number,drawProb:number,awayProb:number,xgHome:any,xgAway:any){
  const ps=[Number(homeProb),Number(drawProb),Number(awayProb)].map(x=>Number.isFinite(x)&&x>=0?x:0);
  const sum=ps.reduce((a,b)=>a+b,0)||1;
  const h=ps[0]/sum,d=ps[1]/sum,a=ps[2]/sum;
  const lh=Number(xgHome),la=Number(xgAway);
  const xgReady=Number.isFinite(lh)&&Number.isFinite(la)&&lh>0&&la>0;
  if(!xgReady)return{
    "1X":h+d,"X2":d+a,"12":h+a,
    "BTTS_YES":null,"BTTS_NO":null,"OVER_2_5":null,"UNDER_2_5":null,
    xg_available:false
  };
  const bttsYes=(1-Math.exp(-lh))*(1-Math.exp(-la));
  const total=lh+la;
  const under25=Math.exp(-total)*(1+total+(total*total/2));
  return{
    "1X":h+d,"X2":d+a,"12":h+a,
    "BTTS_YES":bttsYes,"BTTS_NO":1-bttsYes,
    "OVER_2_5":1-under25,"UNDER_2_5":under25,
    xg_available:true
  };
}
const MARKET_OUTCOMES:any={h2h:["1","X","2"],double_chance:["1X","X2","12"],btts:["YES","NO"],ou_2_5:["OVER 2.5","UNDER 2.5"]};
function median(values:number[]){const xs=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!xs.length)return null;const mid=Math.floor(xs.length/2);return xs.length%2?xs[mid]:(xs[mid-1]+xs[mid])/2}
function marketFairProbability(oddsRows:any[],market:string,selection:string){
  const required=MARKET_OUTCOMES[market];if(!required)return null;
  const groups=new Map<string,Map<string,number>>();
  for(const row of oddsRows||[]){if(String(row.market)!==market)continue;const bookmaker=String(row.bookmaker||"unknown"),sel=String(row.selection||"").toUpperCase(),price=Number(row.odds);if(!required.includes(sel)||!Number.isFinite(price)||price<=1)continue;const group=groups.get(bookmaker)||new Map<string,number>();const current=group.get(sel);if(current==null||price>current)group.set(sel,price);groups.set(bookmaker,group)}
  const fairValues:number[]=[],margins:number[]=[];
  for(const group of groups.values()){if(!required.every((x:string)=>group.has(x)))continue;const implied=required.map((x:string)=>1/Number(group.get(x)));const total=implied.reduce((a,b)=>a+b,0);if(!Number.isFinite(total)||total<=0)continue;const idx=required.indexOf(String(selection).toUpperCase());if(idx<0)continue;fairValues.push(implied[idx]/total);margins.push((total-1)*100)}
  if(!fairValues.length)return null;
  const spread=fairValues.length>1?Math.max(...fairValues)-Math.min(...fairValues):0;
  return{probability:median(fairValues),overround_percent:median(margins),bookmakers_count:fairValues.length,agreement_spread:Number((spread*100).toFixed(1)),method:"median_no_vig"};
}
function marketRule(market:string,overround:any){const margin=Math.max(0,Number(overround)||0);const base=market==="double_chance"?{lean:2.5,value:6}:{lean:3,value:7};return{leanEdge:Math.max(base.lean,margin*.9),valueEdge:Math.max(base.value,margin*1.35),leanEv:1,valueEv:3}}
function smartDecision(prob:any,confidence:any,edge:any,ev:any,overround:any,bookmakers:any,agreementSpread:any,signal:string){
  const p=Number(prob),conf=Number(confidence),e=Number(edge),v=Number(ev),margin=Number(overround),books=Number(bookmakers),spread=Number(agreementSpread);
  const reasons:string[]=[];
  if(signal==="NO MARKET") reasons.push("NO MARKET");
  if(!Number.isFinite(p)||p<=0||p>=1) reasons.push("MODEL PROBABILITY UNSTABLE");
  if(Number.isFinite(conf)&&conf>0&&conf<58) reasons.push("LOW MODEL CONFIDENCE");
  if(!Number.isFinite(e)||e<3) reasons.push("EDGE TOO LOW");
  if(!Number.isFinite(v)||v<1) reasons.push("EV TOO LOW");
  if(Number.isFinite(margin)&&margin>10) reasons.push("BOOKMAKER MARGIN HIGH");
  if(Number.isFinite(spread)&&spread>8) reasons.push("MARKET DISAGREEMENT");
  if(Number.isFinite(e)&&e>22) reasons.push("EDGE OUTLIER");
  const hard=signal==="NO MARKET"||reasons.some(x=>["MODEL PROBABILITY UNSTABLE","LOW MODEL CONFIDENCE","EDGE TOO LOW","EV TOO LOW","BOOKMAKER MARGIN HIGH","MARKET DISAGREEMENT","EDGE OUTLIER"].includes(x));
  let decision=signal;
  if(hard) decision="NO BET";
  else if(signal==="VALUE"&&conf<68) decision="LEAN";
  const quality=Math.max(0,Math.min(100,
    (Number.isFinite(conf)?conf:50)*.35+
    (Number.isFinite(e)?Math.min(15,Math.max(0,e))*2.2:0)*.25+
    (Number.isFinite(v)?Math.min(10,Math.max(0,v))*3:0)*.2+
    (books>=2?100:65)*.1+
    (Number.isFinite(spread)?Math.max(0,100-spread*6):70)*.1
  ));
  return{decision,quality_score:Math.round(quality),reasons,recommended:Boolean(decision==="VALUE"||decision==="LEAN"),market_agreement:spread==null?"UNKNOWN":spread<=4?"STRONG":spread<=8?"MODERATE":"WEAK",bookmaker_consensus:books>=2?"MULTI_BOOK":"SINGLE_BOOK"};
}
function marketEdge(prob:any,odds:any,oddsRows:any[]=[],market:string="",selection:string=""){
  const p=Number(prob),o=Number(odds);if(!Number.isFinite(p)||!Number.isFinite(o)||o<=1)return{implied:null,fair_probability:null,fair_odds:null,overround_percent:null,bookmakers_count:0,edge:null,ev:null,signal:"NO MARKET"};
  const implied=1/o,fair=marketFairProbability(oddsRows,market,selection),fairProbability=fair?.probability??implied,overround=fair?.overround_percent??null,edge=(p-fairProbability)*100,ev=(p*o-1)*100,rule=marketRule(market,overround);
  const signal=edge>=rule.valueEdge&&ev>=rule.valueEv?"VALUE":edge>=rule.leanEdge&&ev>=rule.leanEv?"LEAN":"NO BET";
  const gate=smartDecision(p,null,edge,ev,overround,fair?.bookmakers_count||0,fair?.agreement_spread??null,signal);
  return{implied:Number(implied.toFixed(4)),fair_probability:Number(fairProbability.toFixed(4)),fair_odds:Number((1/fairProbability).toFixed(2)),overround_percent:overround==null?null:Number(overround.toFixed(1)),bookmakers_count:fair?.bookmakers_count||0,agreement_spread:fair?.agreement_spread??null,market_agreement:gate.market_agreement,bookmaker_consensus:gate.bookmaker_consensus,edge:Number(edge.toFixed(1)),ev:Number(ev.toFixed(1)),thresholds:{lean_edge:Number(rule.leanEdge.toFixed(1)),value_edge:Number(rule.valueEdge.toFixed(1)),lean_ev:rule.leanEv,value_ev:rule.valueEv},fair_method:fair?.method||"raw_implied_fallback",signal,smart_decision:gate.decision,quality_score:gate.quality_score,decision_reasons:gate.reasons,recommended:gate.recommended};
}
function normalize3(p:any){const h=Number(p?.home),d=Number(p?.draw),a=Number(p?.away),sum=h+d+a;return Number.isFinite(sum)&&sum>0?[h/sum,d/sum,a/sum]:null}
function xg1x2Prob(xh:any,xa:any){const h=Number(xh),a=Number(xa);if(!Number.isFinite(h)||!Number.isFinite(a)||h<0||a<0)return null;const ph=(k:number)=>Math.exp(-h)*Math.pow(h,k)/factorial(k),pa=(k:number)=>Math.exp(-a)*Math.pow(a,k)/factorial(k);let home=0,draw=0,away=0;for(let i=0;i<=7;i++)for(let j=0;j<=7;j++){const p=ph(i)*pa(j);if(i>j)home+=p;else if(i===j)draw+=p;else away+=p}return normalize3({home,draw,away})}
function marketConsensus1x2(oddsRows:any[]){const groups=new Map<string,Map<string,number>>();for(const row of oddsRows||[]){if(String(row.market)!=="h2h")continue;const b=String(row.bookmaker||"unknown"),s=String(row.selection||"").toUpperCase(),o=Number(row.odds);if(!["1","X","2"].includes(s)||!Number.isFinite(o)||o<=1)continue;const g=groups.get(b)||new Map<string,number>();const cur=g.get(s);if(cur==null||o>cur)g.set(s,o);groups.set(b,g)}const ps:number[][]=[];for(const g of groups.values()){if(!["1","X","2"].every(k=>g.has(k)))continue;const raw=["1","X","2"].map(k=>1/Number(g.get(k))),sum=raw.reduce((a,b)=>a+b,0);if(sum>0)ps.push(raw.map(v=>v/sum))}if(!ps.length)return null;return{probabilities:normalize3({home:median(ps.map(x=>x[0])),draw:median(ps.map(x=>x[1])),away:median(ps.map(x=>x[2]))}),bookmakers:ps.length}}
function ensembleProbabilities(engine:any,ai:any,market:any,xg:any){const components:any[]=[];const add=(name:string,p:any,w:number)=>{const n=normalize3(p);if(n)components.push({name,p:n,weight:w})};add("ENGINE",{home:engine?.p?.[0],draw:engine?.p?.[1],away:engine?.p?.[2]},.40);add("DEEP_AI",ai?.probabilities,.35);add("MARKET",market?.probabilities,.15);add("XG",{home:xg?.[0],draw:xg?.[1],away:xg?.[2]},.10);const total=components.reduce((s,x)=>s+x.weight,0);if(!total)return{probabilities:[.333,.334,.333],components:[],confidence:33,prediction:"X"};const p=[0,0,0];for(const x of components)for(let i=0;i<3;i++)p[i]+=x.p[i]*x.weight/total;const probabilities=normalize3({home:p[0],draw:p[1],away:p[2]})||[.333,.334,.333];const prediction=probabilities[0]>=probabilities[2]&&probabilities[0]>=probabilities[1]?"1":probabilities[2]>=probabilities[1]?"2":"X";return{probabilities,components:components.map(x=>({name:x.name,weight:x.weight,probabilities:x.p})),confidence:Math.round(Math.max(...probabilities)*100),prediction}}
function calibrationBin(conf:number){return Math.min(9,Math.max(0,Math.floor(Math.max(0,Math.min(99.999,conf))/10)))}
async function confidenceCalibration(){
  const {data:e}=await sb.from("football_ai_evaluations").select("prediction_id,actual_result,correct").order("evaluated_at",{ascending:false}).limit(500);
  const rows=e||[];const ids=rows.map((x:any)=>x.prediction_id).filter(Boolean);
  const {data:ps}=ids.length?await sb.from("football_ai_predictions").select("id,prediction,confidence,reasoning").in("id",ids):{data:[]};
  const byId=new Map((ps||[]).map((x:any)=>[x.id,x]));const usable=rows.map((x:any)=>({e:x,p:byId.get(x.prediction_id)})).filter((x:any)=>x.p&&Number.isFinite(Number(x.p.confidence)));
  const bins=Array.from({length:10},(_,i)=>({bucket:i*10+"-"+(i===9?100:(i+1)*10)+"%",samples:0,avg_confidence:0,accuracy:null as number|null,calibrated_confidence:null as number|null}));
  for(const x of usable){const conf=Math.max(0,Math.min(100,Number(x.p.confidence)));const b=bins[calibrationBin(conf)];b.samples++;b.avg_confidence+=conf}
  for(const b of bins){if(b.samples)b.avg_confidence/=b.samples}
  for(const x of usable){const conf=Math.max(0,Math.min(100,Number(x.p.confidence)));const b=bins[calibrationBin(conf)];if(b.accuracy==null)b.accuracy=0;b.accuracy+=x.e.correct?1:0}
  for(const b of bins)if(b.samples){b.accuracy=Number((b.accuracy/b.samples*100).toFixed(1));b.calibrated_confidence=Number(((b.accuracy*b.samples+50*20)/(b.samples+20)).toFixed(1))}
  const n=usable.length;let ece=0,brier=0;
  for(const b of bins){if(b.samples)ece+=Math.abs((Number(b.avg_confidence)||0)/100-(Number(b.accuracy)||0)/100)*(b.samples/n)}for(const x of usable){const conf=Math.max(0,Math.min(100,Number(x.p.confidence)))/100;const probs=x.p.reasoning?.ensemble_probabilities||{};const actual=String(x.e.actual_result||"");const actualIdx=actual==="1"?"home":actual==="X"?"draw":"away";const hp=Number(probs.home),dp=Number(probs.draw),ap=Number(probs.away);if([hp,dp,ap].every(Number.isFinite)){brier+=Math.pow(hp-(actualIdx==="home"?1:0),2)+Math.pow(dp-(actualIdx==="draw"?1:0),2)+Math.pow(ap-(actualIdx==="away"?1:0),2)}else brier+=Math.pow((String(x.p.prediction)===actual?1:0)-conf,2)}
  const status=n<30?"COLLECTING":n<100?"LEARNING":"CALIBRATED";
  const recent=usable.slice(0,100);const recentAcc=recent.length?recent.filter(x=>x.e.correct).length/recent.length:null;
  const recentConf=recent.length?recent.reduce((a,x)=>a+Number(x.p.confidence||0),0)/recent.length:null;
  return{status,samples:n,ece:n?Number((ece*100).toFixed(2)):null,brier_score:n?Number((brier/n).toFixed(4)):null,recent_accuracy:recentAcc==null?null:Number((recentAcc*100).toFixed(1)),recent_confidence:recentConf==null?null:Number(recentConf.toFixed(1)),bins};
}
function calibratedConfidence(raw:number,cal:any){
  const r=Math.max(0,Math.min(100,Number(raw)||0));if(!cal||!cal.samples)return{confidence:r,adjustment:0,method:"raw_no_history"};
  const b=cal.bins?.[calibrationBin(r)];if(!b||!Number.isFinite(Number(b.calibrated_confidence)))return{confidence:r,adjustment:0,method:"raw_unavailable"};
  const strength=Math.min(1,Number(b.samples||0)/40);const c=r*(1-strength)+Number(b.calibrated_confidence)*strength;
  return{confidence:Math.round(Math.max(0,Math.min(100,c))),adjustment:Math.round(c-r),method:"empirical_shrinkage"};
}
function opponentStrengthScores(teamName:string,stats:any[],matches:any[]){
  const key=norm(teamName);
  const relevant=(matches||[]).filter((m:any)=>norm(m.home_team)===key||norm(m.away_team)===key).slice(-20);
  if(!relevant.length)return null;
  const oppValues:number[]=[];const results:number[]=[];const xgDiffs:number[]=[];
  for(const m of relevant){
    const home=norm(m.home_team)===key;const opponent=home?m.away_team:m.home_team;
    const os=stats.find((s:any)=>norm(s.team_name)===norm(opponent));
    const oppBase=os?(Number(os.wins||0)-Number(os.losses||0)+.35*(Number(os.goals_for||0)-Number(os.goals_against||0))+.45*(Number(os.xg_for||0)-Number(os.xg_against||0))):0;
    oppValues.push(oppBase);
    const hs=Number(m.home_score),as=Number(m.away_score);
    if(Number.isFinite(hs)&&Number.isFinite(as))results.push(home?(hs>as?1:hs===as?.5:0):(as>hs?1:as===hs?.5:0));
    const hx=Number(m.home_xg),ax=Number(m.away_xg);
    if(Number.isFinite(hx)&&Number.isFinite(ax))xgDiffs.push(home?hx-ax:ax-hx);
  }
  const avg=(xs:number[])=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
  const oppScore=Math.max(0,Math.min(100,50+avg(oppValues)*2));
  const score=Math.max(0,Math.min(100,oppScore+avg(results)*18+avg(xgDiffs)*10));
  return{score:Math.round(score),opponent_strength:Math.round(oppScore),result_component:Math.round(avg(results)*100),xg_component:xgDiffs.length?Math.round(Math.max(0,Math.min(100,50+avg(xgDiffs)*10))):null,sample_size:relevant.length};
}
function advancedTeamStrength(teamName:string,stats:any[],matches:any[]){
  const s=opponentStrengthScores(teamName,stats,matches);if(!s)return null;
  const base=stats.find((x:any)=>norm(x.team_name)===norm(teamName));
  const form=Number(base?.wins||0)-Number(base?.losses||0);
  const attack=Number(base?.goals_for||0)-Number(base?.goals_against||0);
  const xg=Number(base?.xg_for||0)-Number(base?.xg_against||0);
  return{score:Math.round(Math.max(0,Math.min(100,s.score+form*1.5+attack*.5+xg*2))),opponent_adjusted:s.score,form_component:Math.round(form),attack_component:Number(attack.toFixed(1)),xg_component:Number(xg.toFixed(1)),sample_size:s.sample_size};
}
function gameStateModel(m:any,stats:any[],homeAway:any=null){
  const h=stats.find((x:any)=>norm(x.team_name)===norm(m.home_team));
  const a=stats.find((x:any)=>norm(x.team_name)===norm(m.away_team));
  const rate=(x:any)=>{
    const gf=Number(x?.goals_for||0),ga=Number(x?.goals_against||0);
    const games=Math.max(1,Number(x?.wins||0)+Number(x?.losses||0)+Number(x?.draws||0));
    const xgf=Number(x?.xg_for),xga=Number(x?.xg_against);
    return{attack:Number.isFinite(xgf)&&xgf>0?xgf/games:Math.max(.25,gf/games),defense:Number.isFinite(xga)&&xga>0?xga/games:Math.max(.25,ga/games)};
  };
  const hr=rate(h),ar=rate(a);
  const haH=Number(homeAway?.home?.score),haA=Number(homeAway?.away?.score);
  const venueH=Number.isFinite(haH)?(haH-50)/35:0,venueA=Number.isFinite(haA)?(haA-50)/35:0;
  const baseH=Math.max(.2,Math.min(3.8,hr.attack*.62+ar.defense*.38+venueH*.18));
  const baseA=Math.max(.2,Math.min(3.8,ar.attack*.62+hr.defense*.38+venueA*.18));
  const scenarios:any[]=[];
  for(let home=0;home<=3;home++)for(let away=0;away<=3;away++){
    const p=poisson(baseH,home)*poisson(baseA,away);
    const state=home>away?"HOME_LEAD":home<away?"AWAY_LEAD":"LEVEL";
    const margin=home-away;
    const stateBias=state==="HOME_LEAD"?Math.min(1.5,margin*.28):state==="AWAY_LEAD"?Math.max(-1.5,margin*.28):0;
    const continuation=Math.max(0,Math.min(100,50+stateBias*18+(baseH-baseA)*8));
    scenarios.push({score_state:home+"-"+away,state,probability:Number(p.toFixed(5)),continuation_score:Math.round(continuation)});
  }
  const total=scenarios.reduce((x,y)=>x+y.probability,0)||1;
  for(const x of scenarios)x.probability=Number((x.probability/total).toFixed(5));
  const level=scenarios.filter(x=>x.state==="LEVEL").reduce((x,y)=>x+y.probability,0);
  const homeLead=scenarios.filter(x=>x.state==="HOME_LEAD").reduce((x,y)=>x+y.probability,0);
  const awayLead=scenarios.filter(x=>x.state==="AWAY_LEAD").reduce((x,y)=>x+y.probability,0);
  const weighted=scenarios.reduce((x,y)=>x+y.probability*y.continuation_score,0);
  const stateEdge=(homeLead-awayLead)*.18;
  return{expected_goals:{home:Number(baseH.toFixed(2)),away:Number(baseA.toFixed(2))},scenarios:scenarios.sort((x,y)=>y.probability-x.probability).slice(0,8),state_probabilities:{level:Number(level.toFixed(4)),home_lead:Number(homeLead.toFixed(4)),away_lead:Number(awayLead.toFixed(4))},continuation_score:Math.round(weighted),state_edge:Number(stateEdge.toFixed(4)),method:"score_state_scenarios_poisson_v1"};
}

function advancedMomentum(teamName:string,stats:any[],matches:any[]){
  const key=norm(teamName),now=Date.now();
  const rows=(matches||[]).filter((m:any)=>{
    const involved=norm(m.home_team)===key||norm(m.away_team)===key;
    const hs=Number(m.home_score),as=Number(m.away_score);
    return involved&&!VOID.has(String(m.status||"").toLowerCase())&&Number.isFinite(hs)&&Number.isFinite(as)&&new Date(m.kickoff_at).getTime()<=now;
  }).slice(0,10);
  if(!rows.length)return null;
  let wSum=0,points=0,gd=0,xgd=0,xgW=0;const results:string[]=[];
  for(const m of rows){
    const home=norm(m.home_team)===key,hs=Number(m.home_score),as=Number(m.away_score);
    const gf=home?hs:as,ga=home?as:hs,age=Math.max(0,(now-new Date(m.kickoff_at).getTime())/86400000);
    const w=Math.exp(-age/21),pts=gf>ga?3:gf===ga?1:0;
    wSum+=w;points+=pts*w;gd+=(gf-ga)*w;
    const hx=Number(m.home_xg),ax=Number(m.away_xg);
    if(Number.isFinite(hx)&&Number.isFinite(ax)){xgd+=(home?hx-ax:ax-hx)*w;xgW+=w}
    results.push(gf>ga?"W":gf===ga?"D":"L");
  }
  const avg=(v:number)=>wSum?v/wSum:0;
  const pointsRate=avg(points)/3*100;
  const goalComponent=Math.max(0,Math.min(100,50+avg(gd)*12));
  const xgComponent=xgW?Math.max(0,Math.min(100,50+(xgd/xgW)*12)):50;
  const momentum=Math.max(0,Math.min(100,pointsRate*.55+goalComponent*.25+xgComponent*.20));
  const direction=results.slice(0,5).filter(x=>x==="W").length-results.slice(0,5).filter(x=>x==="L").length;
  return{score:Math.round(momentum),points_rate:Math.round(pointsRate),goal_diff:Number(avg(gd).toFixed(2)),xg_diff:xgW?Number((xgd/xgW).toFixed(2)):null,recent_results:results.slice(0,5),direction,sample_size:rows.length,recency_method:"exp_decay_21d"};
}
async function lineupIntelligence(m:any){
  const token=env("SPORTMONKS_API_TOKEN")||env("SPORT_API_KEY");
  if(!token)return{status:"NO_PROVIDER",method:"sportmonks_lineup_v1"};
  const base=env("SPORTMONKS_API_BASE_URL","https://api.sportmonks.com/v3/football");
  try{
    const day=apiDate(new Date(m.kickoff_at));
    const q=(await jsonFetch(base+"/fixtures/between/"+day+"/"+day+"?api_token="+encodeURIComponent(token)+"&include=participants;state;lineups.player;sidelined;expectedLineups&timezone=Europe%2FOslo&per_page=100",{headers:{accept:"application/json"}},12000)).data;
    const fixtures=Array.isArray(q?.data)?q.data:[];
    const key=(s:any)=>norm(s);
    const fixture=fixtures.find((f:any)=>{
      const ps=Array.isArray(f.participants)?f.participants:[];
      const home=ps.find((p:any)=>p?.meta?.location==="home"||p?.location==="home")?.name;
      const away=ps.find((p:any)=>p?.meta?.location==="away"||p?.location==="away")?.name;
      return key(home)===key(m.home_team)&&key(away)===key(m.away_team);
    });
    if(!fixture)return{status:"NO_FIXTURE",method:"sportmonks_lineup_v1"};
    const participants=Array.isArray(fixture.participants)?fixture.participants:[];
    const teamIdByName=new Map(participants.map((p:any)=>[key(p?.name),Number(p?.id)]));
    const lineups=Array.isArray(fixture.lineups)?fixture.lineups:[];
    const sidelined=Array.isArray(fixture.sidelined)?fixture.sidelined:[];
    const expected=Array.isArray(fixture.expectedLineups)?fixture.expectedLineups:[];
    const rating=(p:any)=>{
      const values=[p?.rating,p?.average_rating,p?.season_rating,p?.player_rating,p?.statistics?.rating,p?.stats?.rating,p?.data?.rating].map(Number).filter(Number.isFinite);
      return values.length?Math.max(0,Math.min(10,values[0])):null;
    };
    const build=(teamName:string)=>{
      const tid=teamIdByName.get(key(teamName));
      const confirmed=lineups.filter((x:any)=>Number(x?.team_id??x?.participant_id??x?.team?.id)===tid);
      const exp=expected.filter((x:any)=>Number(x?.team_id??x?.participant_id??x?.team?.id)===tid);
      const unavailable=sidelined.filter((x:any)=>Number(x?.team_id??x?.participant_id??x?.team?.id)===tid);
      const starters=confirmed.filter((x:any)=>Boolean(x?.starter??x?.starting_xi??x?.meta?.starter));
      const players=confirmed.length?confirmed:exp;
      const ratings=players.map(rating).filter((x:any)=>x!=null) as number[];
      const unavailableRatings=unavailable.map(rating).filter((x:any)=>x!=null) as number[];
      const avg=ratings.length?ratings.reduce((a,b)=>a+b,0)/ratings.length:null;
      const missingImpact=unavailableRatings.length?unavailableRatings.reduce((a,b)=>a+(b/10),0):0;
      return{
        confirmed_lineup:confirmed.length>0,
        expected_lineup:exp.length>0,
        players_count:players.length,
        starters_count:starters.length,
        unavailable_count:unavailable.length,
        rated_players:ratings.length,
        average_rating:avg==null?null:Number(avg.toFixed(2)),
        unavailable_rating_impact:unavailableRatings.length?Number(missingImpact.toFixed(2)):null,
        lineup_strength:avg==null?50:Math.round(Math.max(0,Math.min(100,avg*10))),
        availability_score:Math.round(Math.max(0,Math.min(100,100-missingImpact*18))),
        confidence:confirmed.length>=11?100:exp.length>=11?72:players.length?45:20
      };
    };
    const home=build(m.home_team),away=build(m.away_team);
    const hAvail=Number(home.availability_score),aAvail=Number(away.availability_score);
    const hStrength=Number(home.lineup_strength),aStrength=Number(away.lineup_strength);
    const edge=(Number.isFinite(hStrength)&&Number.isFinite(aStrength)?(hStrength-aStrength)*.018:0)+(Number.isFinite(hAvail)&&Number.isFinite(aAvail)?(hAvail-aAvail)*.012:0);
    return{
      status:"OK",
      fixture_id:fixture.id,
      confirmed:Boolean(lineups.length),
      expected:Boolean(expected.length),
      sidelined:Boolean(sidelined.length),
      home,away,
      lineup_edge:Number(edge.toFixed(3)),
      method:"sportmonks_lineup_v1"
    };
  }catch(e){
    return{status:"ERROR",error:e instanceof Error?e.message:String(e),method:"sportmonks_lineup_v1"};
  }
}
function tacticalIntelligence(m:any,lineup:any){
  const home=lineup?.home||{},away=lineup?.away||{};
  const formation=(x:any)=>String(x?.formation||x?.tactical_formation||x?.meta?.formation||x?.formation_name||"").trim();
  const hFormation=formation(home),aFormation=formation(away);
  const hPlayers=Number(home?.players_count)||0,aPlayers=Number(away?.players_count)||0;
  const hConfirmed=Boolean(home?.confirmed_lineup),aConfirmed=Boolean(away?.confirmed_lineup);
  const hReady=hConfirmed&&hPlayers>=11,aReady=aConfirmed&&aPlayers>=11;
  const parse=(f:string)=>{
    const p=f.match(/(\d+)[-–](\d+)(?:[-–](\d+))?(?:[-–](\d+))?/);
    return p?[Number(p[1]),Number(p[2]),p[3]?Number(p[3]):null,p[4]?Number(p[4]):null]:null;
  };
  const shape=(f:string)=>{
    const p=parse(f);if(!p)return{attack:50,midfield:50,defence:50};
    const [d,mid,att]=p;
    return{attack:Math.min(100,50+(att||0)*8),midfield:Math.min(100,50+(mid||0)*5),defence:Math.min(100,50+d*5)};
  };
  const hs=shape(hFormation),as=shape(aFormation);
  const formationEdge=(hFormation&&aFormation)?(
    ((hs.attack-as.attack)*.012)+((hs.midfield-as.midfield)*.010)+((hs.defence-as.defence)*.006)
  ):0;
  const readiness=((hReady?1:0)-(aReady?1:0))*0.02;
  const certainty=(Math.max(Number(home?.confidence)||0,Number(away?.confidence)||0));
  const score=Math.max(0,Math.min(100,50+formationEdge*20+readiness*20));
  return{
    status:(hFormation||aFormation)?"OK":"LIMITED",
    home:{formation:hFormation||null,shape:hs,ready:hReady,confidence:Number(home?.confidence)||0},
    away:{formation:aFormation||null,shape:as,ready:aReady,confidence:Number(away?.confidence)||0},
    formation_edge:Number(formationEdge.toFixed(3)),
    readiness_edge:Number(readiness.toFixed(3)),
    tactical_score:Math.round(score),
    confidence:Math.round(certainty),
    method:"sportmonks_tactical_shape_v1"
  };
}
async function managerTacticalMatchup(m:any,lineup:any,tactical:any=null){
  const token=env("SPORTMONKS_API_TOKEN")||env("SPORT_API_KEY");
  const base=env("SPORTMONKS_API_BASE_URL","https://api.sportmonks.com/v3/football");
  const fallback=(status:string,extra:any={})=>({
    status,
    home:{manager:null,manager_id:null,experience:50,style:null},
    away:{manager:null,manager_id:null,experience:50,style:null},
    manager_edge:0,
    style_matchup_edge:0,
    tactical_matchup_edge:0,
    confidence:20,
    method:"sportmonks_manager_matchup_v1",
    ...extra
  });
  if(!token)return fallback("NO_PROVIDER");
  const fixtureId=lineup?.fixture_id;
  if(!fixtureId)return fallback("NO_FIXTURE");
  try{
    const data=(await jsonFetch(base+"/fixtures/"+encodeURIComponent(String(fixtureId))+"?api_token="+encodeURIComponent(token)+"&include=participants;coaches;lineups.player&timezone=Europe%2FOslo",{headers:{accept:"application/json"}},12000)).data?.data||{};
    const participants=Array.isArray(data.participants)?data.participants:[];
    const coaches=Array.isArray(data.coaches)?data.coaches:[];
    const teamId=(name:string)=>Number(participants.find((p:any)=>norm(p?.name)===norm(name))?.id||0);
    const pickCoach=(name:string)=>{
      const tid=teamId(name);
      const rows=coaches.filter((x:any)=>Number(x?.team_id??x?.participant_id??x?.team?.id)===tid);
      const x=rows[0]||coaches.find((x:any)=>norm(x?.team?.name)===norm(name));
      if(!x)return null;
      const coach=x.coach||x.manager||x;
      const stats=x.statistics||coach.statistics||{};
      const matches=Number(stats.matches??stats.appearances??x.matches??0);
      const wins=Number(stats.wins??x.wins??0);
      const losses=Number(stats.losses??x.losses??0);
      const experience=Math.max(25,Math.min(100,50+Math.min(25,matches/8)+Math.max(-20,Math.min(20,(wins-losses)*1.5))));
      const nameValue=String(coach?.name||x?.name||"").trim()||null;
      return{id:Number(coach?.id??x?.coach_id??x?.id)||null,name:nameValue,matches,wins,losses,experience:Math.round(experience)};
    };
    const home=pickCoach(m.home_team),away=pickCoach(m.away_team);
    const hFormation=String(tactical?.home?.formation||"");
    const aFormation=String(tactical?.away?.formation||"");
    const formationFamily=(f:string)=>{
      const p=f.match(/(\d+)[-–](\d+)(?:[-–](\d+))?/);
      if(!p)return "UNKNOWN";
      const mid=Number(p[2]),att=Number(p[3]||0);
      return mid>=4?"MIDFIELD_HEAVY":att>=3?"ATTACKING":"BALANCED";
    };
    const hf=formationFamily(hFormation),af=formationFamily(aFormation);
    const familyScore=(x:string)=>x==="ATTACKING"?1:x==="MIDFIELD_HEAVY"?0.5:x==="BALANCED"?0.2:0;
    const styleMatchupEdge=(hf!=="UNKNOWN"&&af!=="UNKNOWN")?(familyScore(hf)-familyScore(af))*.025:0;
    const hExp=Number(home?.experience),aExp=Number(away?.experience);
    const managerEdge=Number.isFinite(hExp)&&Number.isFinite(aExp)?(hExp-aExp)*.002:0;
    const tacticalMatchupEdge=(Number(tactical?.formation_edge)||0)+styleMatchupEdge+managerEdge;
    const available=(home?1:0)+(away?1:0);
    return{
      status:available===2?"OK":available===1?"PARTIAL":"NO_MANAGER_DATA",
      home:{manager:home?.name||null,manager_id:home?.id||null,experience:home?.experience??50,style:hf,record:{matches:home?.matches||0,wins:home?.wins||0,losses:home?.losses||0}},
      away:{manager:away?.name||null,manager_id:away?.id||null,experience:away?.experience??50,style:af,record:{matches:away?.matches||0,wins:away?.wins||0,losses:away?.losses||0}},
      manager_edge:Number(managerEdge.toFixed(3)),
      style_matchup_edge:Number(styleMatchupEdge.toFixed(3)),
      tactical_matchup_edge:Number(tacticalMatchupEdge.toFixed(3)),
      confidence:available===2?75:available===1?45:20,
      method:"sportmonks_manager_matchup_v1"
    };
  }catch(e){
    return fallback("ERROR",{error:e instanceof Error?e.message:String(e)});
  }
}
async function refereeEnvironmentIntelligence(m:any){
  const token=env("SPORTMONKS_API_TOKEN")||env("SPORT_API_KEY");
  const base=env("SPORTMONKS_API_BASE_URL","https://api.sportmonks.com/v3/football");
  const fallback=(status:string,extra:any={})=>({status,referee:null,referee_id:null,cards_per_match:50,penalties_per_match:20,home_bias:50,discipline_edge:0,penalty_edge:0,environment_edge:0,confidence:15,method:"sportmonks_referee_environment_v1",...extra});
  if(!token)return fallback("NO_PROVIDER");
  if(!m?.id)return fallback("NO_MATCH");
  try{
    const payload=(await jsonFetch(base+"/fixtures/"+encodeURIComponent(String(m.provider_fixture_id||m.fixture_id||m.id))+"?api_token="+encodeURIComponent(token)+"&include=referee&timezone=Europe%2FOslo",{headers:{accept:"application/json"}},12000)).data?.data||{};
    const r=payload.referee||payload.official||payload.referees?.[0]||null;
    if(!r)return fallback("NO_REFEREE_DATA");
    const stats=r.statistics||r.stats||{};
    const cards=Number(stats.cards_per_match??stats.average_cards??r.cards_per_match??r.average_cards);
    const penalties=Number(stats.penalties_per_match??stats.average_penalties??r.penalties_per_match??r.average_penalties);
    const homeBias=Number(stats.home_bias??r.home_bias);
    const disciplineEdge=Number.isFinite(cards)?Math.max(-.08,Math.min(.08,(cards-50)*.002)):0;
    const penaltyEdge=Number.isFinite(penalties)?Math.max(-.05,Math.min(.05,(penalties-20)*.0015)):0;
    const environmentEdge=(Number.isFinite(homeBias)?(homeBias-50)*.0025:0)+disciplineEdge*.15+penaltyEdge*.15;
    return{status:"OK",referee:String(r.name||r.display_name||"").trim()||null,referee_id:Number(r.id)||null,cards_per_match:Number.isFinite(cards)?cards:null,penalties_per_match:Number.isFinite(penalties)?penalties:null,home_bias:Number.isFinite(homeBias)?homeBias:null,discipline_edge:Number(disciplineEdge.toFixed(3)),penalty_edge:Number(penaltyEdge.toFixed(3)),environment_edge:Number(environmentEdge.toFixed(3)),confidence:Number.isFinite(cards)||Number.isFinite(penalties)||Number.isFinite(homeBias)?60:35,method:"sportmonks_referee_environment_v1"};
  }catch(e){return fallback("ERROR",{error:e instanceof Error?e.message:String(e)})}
}


async function leagueCompetitionIntelligence(m:any,stats:any[]){
  const league=String(m?.league||m?.raw?.league?.name||m?.competition||m?.raw?.competition?.name||"").trim();
  const type=String(m?.type||m?.raw?.type||m?.raw?.fixture_type||"").trim();
  const text=(league+" "+type).toLowerCase();
  const token=env("SPORTMONKS_API_TOKEN")||env("SPORT_API_KEY");
  const base=env("SPORTMONKS_API_BASE_URL","https://api.sportmonks.com/v3/football");
  const tier=/champions league|europa league|conference league|nations league|world cup|premier league|la liga|serie a|bundesliga|ligue 1|eredivisie|primeira liga/i.test(text)?88:/championship|segunda|serie b|2\. bundesliga|ligue 2|eliteserien|superliga|allsvenskan|ekstraklasa/i.test(text)?68:/friendly|test match/i.test(text)?35:55;
  const competitionLevel=/cup|trophy|super cup|playoff|play-off|final|semi-final|quarter-final/i.test(text)?82:tier;
  const importance=/final|semi-final|quarter-final|playoff|play-off|relegation|promotion/i.test(text)?92:/derby|rival/i.test(text)?78:Math.max(45,competitionLevel*.72);
  const h=stats.find((x:any)=>norm(x.team_name)===norm(m.home_team)),a=stats.find((x:any)=>norm(x.team_name)===norm(m.away_team));
  const formPressure=(s:any)=>{if(!s)return 50;const games=Number(s.wins||0)+Number(s.losses||0)+Number(s.draws||0);if(!games)return 50;const rate=(Number(s.wins||0)*3+Number(s.draws||0))/Math.max(1,games*3);return Math.max(0,Math.min(100,50+(rate-.5)*55))};
  const homePressure=formPressure(h),awayPressure=formPressure(a);
  const pressureEdge=(homePressure-awayPressure)*.004;
  const fallback={status:token?"PARTIAL":"LOCAL_ONLY",league:league||null,competition_type:type||null,league_strength:Math.round(tier),competition_level:Math.round(competitionLevel),match_importance:Math.round(importance),table_pressure:{home:Math.round(homePressure),away:Math.round(awayPressure),available:false},pressure_edge:Number(pressureEdge.toFixed(3)),competition_edge:Number(((competitionLevel-50)*.001+pressureEdge).toFixed(3)),confidence:token?48:38,method:"league_competition_context_v1"};
  if(!token||!m?.id)return fallback;
  try{
    const id=m.provider_fixture_id||m.fixture_id||m.id;
    const payload=(await jsonFetch(base+"/fixtures/"+encodeURIComponent(String(id))+"?api_token="+encodeURIComponent(token)+"&include=league;season&timezone=Europe%2FOslo",{headers:{accept:"application/json"}},12000)).data?.data||{};
    const pl=String(payload.league?.name||payload.league?.short_code||league).trim();
    const season=payload.season?.name||payload.season?.id||m.season||m.raw?.season?.name||null;
    return {...fallback,league:pl||fallback.league,season,league_id:Number(payload.league?.id)||null,season_id:Number(payload.season?.id)||null,status:"OK",confidence:60};
  }catch(e){return {...fallback,status:"PARTIAL",error:e instanceof Error?e.message:String(e)}}
}

function preScore(m:any,stats:any[],w:any,advanced:any=null,homeAway:any=null,gameState:any=null,momentum:any=null,lineup:any=null,manager:any=null,leagueCompetition:any=null,referee:any=null){const h=stats.find(x=>norm(x.team_name)===norm(m.home_team)),a=stats.find(x=>norm(x.team_name)===norm(m.away_team));const hf=Number(h?.wins||0)-Number(h?.losses||0),af=Number(a?.wins||0)-Number(a?.losses||0),hg=Number(h?.goals_for||0)-Number(h?.goals_against||0),ag=Number(a?.goals_for||0)-Number(a?.goals_against||0),hx=Number(h?.xg_for||0)-Number(h?.xg_against||0),ax=Number(a?.xg_for||0)-Number(a?.xg_against||0);const advHome=Number(advanced?.home?.score),advAway=Number(advanced?.away?.score);const strengthEdge=Number.isFinite(advHome)&&Number.isFinite(advAway)?(advHome-advAway)*.035:0;const haHome=Number(homeAway?.home?.score),haAway=Number(homeAway?.away?.score);const homeAwayEdge=Number.isFinite(haHome)&&Number.isFinite(haAway)?(haHome-haAway)*.025:0;const gameStateEdge=Number(gameState?.state_edge)||0;const momHome=Number(momentum?.home?.score),momAway=Number(momentum?.away?.score);const momentumEdge=Number.isFinite(momHome)&&Number.isFinite(momAway)?(momHome-momAway)*.02:0;const lineupEdge=Number(lineup?.lineup_edge)||0;const managerEdge=Number(manager?.tactical_matchup_edge)||0;const competitionEdge=Number(leagueCompetition?.competition_edge)||0;const refereeEdge=Number(referee?.environment_edge)||0;const edge=.35*(hf-af)+.08*(hg-ag)+.12*(hx-ax)+strengthEdge+homeAwayEdge+gameStateEdge+momentumEdge+lineupEdge+managerEdge+competitionEdge+refereeEdge+.35;const ww=w&&typeof w.home==="number"&&typeof w.draw==="number"&&typeof w.away==="number"?w:{home:1,draw:.1,away:-1};const p=softmax([edge*ww.home,Math.abs(edge)*Math.max(0,ww.draw),(-edge)*Math.abs(ww.away)]);const selected=p[0]>=p[2]&&p[0]>=p[1]?"1":p[2]>=p[1]?"2":"X";const confidence=Math.max(...p);const engineScore=Math.max(0,Math.min(100,50+Math.abs(edge)*18+Math.max(...p)*35));return {p,selected,confidence,score:engineScore,engineScore,features:{hf,af,hg,ag,hx,ax},weights:ww,home_away_edge:homeAwayEdge,game_state_edge:gameStateEdge,momentum_edge:momentumEdge,lineup_edge:lineupEdge,manager_tactical_edge:managerEdge,competition_edge:competitionEdge,referee_environment_edge:refereeEdge}}

async function deep(m:any,s:any,odds:any[]){
  const fallback={
    prediction:m.model.selected,
    confidence:Math.round(m.model.confidence*100),
    probabilities:{home:m.model.p[0],draw:m.model.p[1],away:m.model.p[2]},
    value_percent:null,
    risk:"Ukjent",
    reasoning:["Statistisk pre-score brukt fordi ingen aktiv AI-provider er tilgjengelig."],
    provider:"statistical",
    model:"pre-score"
  };
  let url="",key="",model="";
  if(s.groq_enabled&&Deno.env.get("GROQ_API_KEY")){
    url="https://api.groq.com/openai/v1/chat/completions";
    key=Deno.env.get("GROQ_API_KEY")!;
    model=Deno.env.get("GROQ_MODEL")||"llama-3.3-70b-versatile";
  }else if(s.openai_enabled&&Deno.env.get("OPENAI_API_KEY")){
    url="https://api.openai.com/v1/chat/completions";
    key=Deno.env.get("OPENAI_API_KEY")!;
    model=Deno.env.get("OPENAI_MODEL")||"gpt-4o-mini";
  }else return fallback;

  const prompt="Analyze this European football match and return JSON only with prediction, confidence, probabilities, value_percent, risk and reasoning. Do not invent facts. Treat the TradeMindMZ Engine as the quantitative baseline, not as a fact source. Match: "+m.home_team+" vs "+m.away_team+". TradeMindMZ Engine: "+JSON.stringify({score:m.model.engineScore,prediction:m.model.selected,features:m.model.features,weights:m.model.weights})+". Odds: "+JSON.stringify(odds.slice(0,8));

  let r:Response;
  const ac=new AbortController();
  const aiTimer=setTimeout(()=>ac.abort(),12000);
  try{
    r=await fetch(url,{
      method:"POST",
      headers:{"authorization":"Bearer "+key,"content-type":"application/json"},
      body:JSON.stringify({
        model,
        messages:[
          {role:"system",content:"You are TradeMindMZ football AI. Do not invent facts. Return valid JSON only."},
          {role:"user",content:prompt}
        ],
        temperature:.1,
        response_format:{type:"json_object"}
      }),
      signal:ac.signal
    });
  }catch{return fallback}
  finally{clearTimeout(aiTimer)}

  if(!r.ok)return fallback;

  let j:any;
  try{j=await r.json()}catch{return fallback}

  let x:any={};
  try{x=JSON.parse(j.choices?.[0]?.message?.content||"{}")}catch{return fallback}

  const prediction=["1","X","2"].includes(String(x.prediction||"").toUpperCase())
    ?String(x.prediction).toUpperCase()
    :fallback.prediction;
  const confidence=Math.max(0,Math.min(100,Number(x.confidence)));
  const probabilities={
    home:Number(x.probabilities?.home),
    draw:Number(x.probabilities?.draw),
    away:Number(x.probabilities?.away)
  };
  const safeProbabilities=Object.values(probabilities).every((v:any)=>Number.isFinite(v))
    ?probabilities
    :fallback.probabilities;

  return {
    ...fallback,
    ...x,
    prediction,
    confidence:Number.isFinite(confidence)?Math.round(confidence):fallback.confidence,
    probabilities:safeProbabilities,
    provider:url.includes("groq")?"groq":"openai",
    model
  };
}
let lastFootballSync=0,lastOddsSync=0,lastResultsFinalSync=0;
const API_TIMEOUT=9000;
const env=(name:string,fallback="")=>Deno.env.get(name)||fallback;
async function jsonFetch(url:string,init:RequestInit={},timeout=API_TIMEOUT){const ac=new AbortController();const t=setTimeout(()=>ac.abort(),timeout);try{const r=await fetch(url,{...init,signal:ac.signal});const text=await r.text();let data:any=null;try{data=text?JSON.parse(text):null}catch{}if(!r.ok)throw new Error(data?.message||data?.errors?.[0]?.message||("HTTP "+r.status));return{data,headers:r.headers}}finally{clearTimeout(t)}}
const apiDate=(d:Date)=>d.toISOString().slice(0,10);
async function sportmonksDataProbe(base:string,token:string,from:string){
  let to=from;
  for(let i=0;i<6;i++)to=nextOsloDate(to);
  const errors:any[]=[];
  try{
    const schedule=(await jsonFetch(base+"/fixtures/between/"+from+"/"+to+"?api_token="+encodeURIComponent(token)+"&include=participants;scores;league;state&timezone=Europe%2FOslo&per_page=20",{headers:{accept:"application/json"}},12000)).data;
    const fixtures=Array.isArray(schedule?.data)?schedule.data:[];
    const sample=fixtures[0];
    if(!sample?.id)return{status:"NO_SAMPLE_FIXTURE",window:{from,to},fixtures_in_window:fixtures.length,available:{fixtures:fixtures.length>0}};
    const fixtureId=encodeURIComponent(String(sample.id));
    const requestInclude=async(include:string)=>{
      try{
        const data=(await jsonFetch(base+"/fixtures/"+fixtureId+"?api_token="+encodeURIComponent(token)+"&include="+include+"&timezone=Europe%2FOslo",{headers:{accept:"application/json"}},12000)).data?.data||{};
        return{data};
      }catch(e){
        const message=e instanceof Error?e.message:String(e);
        errors.push({include,error:message});
        return{data:{},error:message};
      }
    };
    const statsR=await requestInclude("statistics.type");
    const xgR=await requestInclude("xgfixture.type");
    const lineupsR=await requestInclude("lineups.player");
    const sidelinedR=await requestInclude("sidelined");
    const expectedR=await requestInclude("expectedLineups");
    const predictionsR=await requestInclude("predictions.type");

    const statistics=Array.isArray(statsR.data.statistics)?statsR.data.statistics:[];
    const xg=Array.isArray(xgR.data.xgfixture)?xgR.data.xgfixture:[];
    const lineups=Array.isArray(lineupsR.data.lineups)?lineupsR.data.lineups:[];
    const sidelined=Array.isArray(sidelinedR.data.sidelined)?sidelinedR.data.sidelined:[];
    const expectedLineups=Array.isArray(expectedR.data.expectedLineups)?expectedR.data.expectedLineups:[];
    const predictions=Array.isArray(predictionsR.data.predictions)?predictionsR.data.predictions:[];
    const xgRows=xg.filter((x:any)=>Number.isFinite(Number(x?.data?.value)));
    const hasError=(r:any)=>Boolean(r?.error);
    return{
      status:"OK",
      window:{from,to},
      fixtures_in_window:fixtures.length,
      sample_fixture_id:sample.id,
      sample_match:sample.name||null,
      coverage:{
        participants:Array.isArray(sample.participants)?sample.participants.length:0,
        scores:Array.isArray(sample.scores)?sample.scores.length:0,
        statistics:statistics.length,
        xg:xgRows.length,
        lineups:lineups.length,
        sidelined:sidelined.length,
        expected_lineups:expectedLineups.length,
        predictions:predictions.length
      },
      available:{
        fixtures:true,
        statistics:statistics.length>0&&!hasError(statsR),
        xg:xgRows.length>0&&!hasError(xgR),
        lineups:lineups.length>0&&!hasError(lineupsR),
        injuries_or_sidelined:sidelined.length>0&&!hasError(sidelinedR),
        expected_lineups:expectedLineups.length>0&&!hasError(expectedR),
        predictions:predictions.length>0&&!hasError(predictionsR)
      },
      endpoint_errors:errors
    };
  }catch(e){
    return{status:"ERROR",window:{from,to},error:e instanceof Error?e.message:String(e)};
  }
}

function dateShift(date:string,days:number){const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+days);return apiDate(d)}
function entityName(v:any){return String(v?.developer_name||v?.name||v?.code||"").toUpperCase()}
function eventIsShot(e:any){const t=entityName(e?.type);return /GOAL|MISSED_SHOT|SAVED_SHOT|BLOCKED_SHOT/.test(t)&&!/OWN_GOAL/.test(t)}
function shotCategory(e:any){const text=(entityName(e?.sub_type)+" "+String(e?.info||"")).toLowerCase();if(text.includes("penalty"))return"penalty";if(text.includes("header"))return"header";if(text.includes("free kick")||text.includes("free-kick"))return"free_kick";if(text.includes("left foot")||text.includes("right foot")||text.includes("foot"))return"foot";return"other"}
function shotIsGoal(e:any){return entityName(e?.type)==="GOAL"}
function betaRate(category:string,shots:number,goals:number){const prior:{[k:string]:[number,number]}={penalty:[.79,12],header:[.08,24],free_kick:[.05,16],foot:[.10,36],other:[.08,24]};const [mean,strength]=prior[category]||prior.other;return (goals+mean*strength)/(shots+strength)}
async function xgMonitor(targetDate=""){
  const token=env("SPORTMONKS_API_TOKEN")||env("SPORT_API_KEY");
  if(!token)return{status:"ERROR",error:"SPORTMONKS_API_TOKEN mangler"};
  const base=env("SPORTMONKS_API_BASE_URL","https://api.sportmonks.com/v3/football");
  const leagueIds=new Set([271,1659,501,513]);
  let resolvedTarget=String(targetDate||"").trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(resolvedTarget)){
    const today=osloDate(new Date());
    const horizon=dateShift(today,14);
    try{
      const upcoming=(await jsonFetch(base+"/fixtures/between/"+today+"/"+horizon+"?api_token="+encodeURIComponent(token)+"&include=participants;league;state&timezone=Europe%2FOslo&per_page=100",{headers:{accept:"application/json"}},15000)).data;
      const candidates=(Array.isArray(upcoming?.data)?upcoming.data:[])
        .filter((f:any)=>leagueIds.has(Number(f?.league?.id))&&!VOID.has(String(f?.state?.developer_name||f?.state?.name||"").toLowerCase()))
        .sort((a:any,b:any)=>new Date(a.starting_at).getTime()-new Date(b.starting_at).getTime());
      resolvedTarget=candidates[0]?.starting_at?osloDate(new Date(candidates[0].starting_at)):today;
    }catch{
      resolvedTarget=today;
    }
  }
  const windowEnd=dateShift(resolvedTarget,1);
  try{
    const upcoming=(await jsonFetch(base+"/fixtures/between/"+resolvedTarget+"/"+windowEnd+"?api_token="+encodeURIComponent(token)+"&include=participants;league;state&timezone=Europe%2FOslo&per_page=50",{headers:{accept:"application/json"}},15000)).data;
    const fixtures=(Array.isArray(upcoming?.data)?upcoming.data:[]).filter((f:any)=>leagueIds.has(Number(f?.league?.id)));
    const teamIds=new Set<number>();
    for(const f of fixtures)for(const p of Array.isArray(f.participants)?f.participants:[])if(p?.id)teamIds.add(Number(p.id));

    const historyStart=dateShift(resolvedTarget,-90);
    const historyEnd=dateShift(resolvedTarget,-1);
    const historyResponse=(await jsonFetch(base+"/fixtures/between/"+historyStart+"/"+historyEnd+"?api_token="+encodeURIComponent(token)+"&include=participants;league;state&timezone=Europe%2FOslo&per_page=100",{headers:{accept:"application/json"}},15000)).data;
    const historyFixtures=(Array.isArray(historyResponse?.data)?historyResponse.data:[])
      .filter((f:any)=>leagueIds.has(Number(f?.league?.id))&&!VOID.has(String(f?.state?.developer_name||f?.state?.name||"").toLowerCase()))
      .filter((f:any)=>(Array.isArray(f.participants)?f.participants:[]).some((p:any)=>teamIds.has(Number(p?.id))));
    const byTeam=new Map<number,any[]>();
    for(const teamId of teamIds)byTeam.set(teamId,historyFixtures.filter((f:any)=>(Array.isArray(f.participants)?f.participants:[]).some((p:any)=>Number(p?.id)===teamId)).sort((a:any,b:any)=>new Date(b.starting_at).getTime()-new Date(a.starting_at).getTime()).slice(0,5));
    const selectedIds=Array.from(new Set(Array.from(byTeam.values()).flat().map((f:any)=>Number(f.id)).filter(Boolean)));
    const eventFixtures:any[]=[];
    const endpointErrors:any[]=[];
    for(let i=0;i<selectedIds.length;i+=50){
      const ids=selectedIds.slice(i,i+50).join(",");
      try{
        const j=(await jsonFetch(base+"/fixtures/multi/"+ids+"?api_token="+encodeURIComponent(token)+"&include=participants;league;state;events.type;events.subType&timezone=Europe%2FOslo",{headers:{accept:"application/json"}},15000)).data;
        eventFixtures.push(...(Array.isArray(j?.data)?j.data:[]));
      }catch(e){endpointErrors.push({include:"fixtures/multi/events.subType",error:e instanceof Error?e.message:String(e)});}
    }
    const fixtureMap=new Map(eventFixtures.map((f:any)=>[Number(f.id),f]));
    const teams=new Map<number,any>();
    for(const f of fixtures)for(const p of Array.isArray(f.participants)?f.participants:[])if(p?.id)teams.set(Number(p.id),{id:Number(p.id),name:p.name,league_id:Number(f.league?.id||0)});
    const rawTeamHistory=new Map<number,any[]>();
    const uniqueShots=new Map<string,any>();
    const shotKey=(fixtureId:any,e:any)=>{
      const eventId=e?.id??e?.event_id;
      if(eventId!=null)return String(fixtureId)+":event:"+String(eventId);
      return String(fixtureId)+":fallback:"+[
        e?.participant_id??"",
        e?.minute??"",
        e?.extra_minute??"",
        entityName(e?.type),
        entityName(e?.sub_type),
        String(e?.info||"")
      ].join("|");
    };
    for(const [teamId,rows] of byTeam){
      const parsed=rows.map((f:any)=>{
        const full=fixtureMap.get(Number(f.id))||f;
        const participants=Array.isArray(full.participants)?full.participants:Array.isArray(f.participants)?f.participants:[];
        const home=participants.find((p:any)=>p.meta?.location==="home"||p.location==="home")||participants[0];
        const away=participants.find((p:any)=>p.meta?.location==="away"||p.location==="away")||participants[1];
        const eventRows=Array.isArray(full?.events)?full.events:(Array.isArray(full?.events?.data)?full.events.data:[]);
        const shots=eventRows.filter(eventIsShot);
        for(const e of shots)uniqueShots.set(shotKey(full.id,e),{...e,category:shotCategory(e)});
        return{fixture_id:full.id,starting_at:full.starting_at,home_team:home?.name,away_team:away?.name,home_id:Number(home?.id||0),away_id:Number(away?.id||0),shots,event_count:eventRows.length};
      });
      rawTeamHistory.set(teamId,parsed);
    }
    const allShots=Array.from(uniqueShots.values());
    const calibration:any={};
    for(const c of ["penalty","header","free_kick","foot","other"]){
      const rows=allShots.filter(x=>x.category===c);const goals=rows.filter(x=>shotIsGoal(x)).length;
      calibration[c]={shots:rows.length,goals,rate:Number(betaRate(c,rows.length,goals).toFixed(4))};
    }
    const teamMetrics=new Map<number,any>();
    for(const [teamId,parsed] of rawTeamHistory){
      const matches=parsed.map((f:any)=>{
        let xgFor=0,xgAgainst=0,shotsFor=0,shotsAgainst=0;
        for(const e of f.shots){const xg=calibration[shotCategory(e)]?.rate??.08;if(Number(e.participant_id)===teamId){xgFor+=xg;shotsFor++}else{xgAgainst+=xg;shotsAgainst++}}
        return{fixture_id:f.fixture_id,date:f.starting_at,opponent:Number(f.home_id)===teamId?f.away_team:f.home_team,shots_for:shotsFor,shots_against:shotsAgainst,xg_for:Number(xgFor.toFixed(3)),xg_against:Number(xgAgainst.toFixed(3))};
      });
      const n=matches.length;
      teamMetrics.set(teamId,{team_id:teamId,team_name:teams.get(teamId)?.name||"—",matches:n,shots:matches.reduce((a:number,x:any)=>a+x.shots_for,0),xg_for:n?Number((matches.reduce((a:number,x:any)=>a+x.xg_for,0)/n).toFixed(2)):null,xg_against:n?Number((matches.reduce((a:number,x:any)=>a+x.xg_against,0)/n).toFixed(2)):null,recent:matches});
    }
    const monitored=fixtures.map((f:any)=>{
      const ps=Array.isArray(f.participants)?f.participants:[];const home=ps.find((p:any)=>p.meta?.location==="home"||p.location==="home")||ps[0];const away=ps.find((p:any)=>p.meta?.location==="away"||p.location==="away")||ps[1];
      const hm=teamMetrics.get(Number(home?.id));const am=teamMetrics.get(Number(away?.id));
      const homeXg=hm?.xg_for!=null&&am?.xg_against!=null?Number(((hm.xg_for+am.xg_against)/2*1.05).toFixed(2)):null;
      const awayXg=am?.xg_for!=null&&hm?.xg_against!=null?Number(((am.xg_for+hm.xg_against)/2*.95).toFixed(2)):null;
      const samples=(hm?.shots||0)+(am?.shots||0);const quality=samples>=30?"GOOD":samples>=15?"BUILDING":"LIMITED";
      return{fixture_id:f.id,league:f.league?.name||"—",kickoff_at:f.starting_at,home_team:home?.name||"—",away_team:away?.name||"—",home:{xg:homeXg,attack_xg:hm?.xg_for??null,defense_xga:hm?.xg_against??null,matches:hm?.matches||0,shots:hm?.shots||0},away:{xg:awayXg,attack_xg:am?.xg_for??null,defense_xga:am?.xg_against??null,matches:am?.matches||0,shots:am?.shots||0},total_xg:homeXg!=null&&awayXg!=null?Number((homeXg+awayXg).toFixed(2)):null,data_quality:quality};
    });
    return{status:"OK",model:{name:"TradeMindMZ xG Engine",version:"xG-v1.1-event",method:"Empirical shot-type model without provider xG add-on",coordinate_free:true,training_window_days:90,history_matches_per_team:5,features:["shot outcome","shot subtype/body part","penalty","free kick"],note:"Uses Sportmonks event data only. No Sportmonks xG values are used."},target_window:{from:resolvedTarget,to:windowEnd},fixtures_found:monitored.length,fixtures:monitored,calibration,teams:Array.from(teamMetrics.values()),diagnostics:{history_fixtures:historyFixtures.length,event_fixtures:eventFixtures.length,event_shots:allShots.length,event_errors:endpointErrors.length},endpoint_errors:endpointErrors,audited_at:new Date().toISOString()};
  }catch(e){return{status:"ERROR",target_window:{from:targetDate,to:windowEnd},error:e instanceof Error?e.message:String(e)}}
}

function liveSignalIntelligence(ctx:any){
  const minute=Math.max(0,Number(ctx?.minute)||0),shots=Math.max(0,Number(ctx?.shots)||0),goals=Math.max(0,Number(ctx?.goals)||0),reds=Math.max(0,Number(ctx?.red_cards)||0);
  const pre=ctx?.pre_prob||null, live=ctx?.live_prob||null;
  const lp=live?normalize3(live):null, pp=pre?normalize3(pre):null;
  const agreement=lp&&pp?1-(Math.abs(lp[0]-pp[0])+Math.abs(lp[1]-pp[1])+Math.abs(lp[2]-pp[2]))/2:null;
  const momentum=lp&&pp?((lp[0]-pp[0])-(lp[2]-pp[2]))*100:null;
  const activity=Math.min(100,shots*4+goals*15+reds*20);
  const lateFactor=minute>=75?1.15:minute>=60?1.05:1;
  const confidence=lp?Math.max(...lp)*100:33;
  const intelligenceScore=Math.max(0,Math.min(100,confidence*.45+(agreement==null?50:agreement*100)*.25+Math.min(100,activity)*.15+Math.min(100,Math.abs(momentum??0)*2)*.15));
  let regime="STABLE";
  if(reds>0)regime="VOLATILE";
  else if(Math.abs(momentum??0)>=12)regime="SHIFTING";
  else if(activity>=45)regime="ACTIVE";
  const direction=momentum==null?"NEUTRAL":momentum>=6?"HOME":momentum<=-6?"AWAY":"NEUTRAL";
  return{score:Math.round(intelligenceScore),regime,direction,momentum:momentum==null?null:Number(momentum.toFixed(1)),agreement:agreement==null?null:Number((agreement*100).toFixed(1)),activity:Math.round(activity*lateFactor),confidence:Math.round(confidence),signals:{score_state:true,pre_match_comparison:Boolean(pp),event_activity:shots>0||goals>0,red_card_alert:reds>0}};
}
function liveRiskGate(value:any,minute:any,redCards:any,shots:any){
  const min=Math.max(0,Number(minute)||0),reds=Math.max(0,Number(redCards)||0),shotCount=Math.max(0,Number(shots)||0);
  const reasons:string[]=[];
  if(min>=85)reasons.push("LATE_MATCH");
  if(reds>0)reasons.push("RED_CARD_VOLATILITY");
  if(value?.best?.edge_percent!=null&&Number(value.best.edge_percent)>18)reasons.push("EDGE_OUTLIER");
  if(value?.best?.expected_value_percent!=null&&Number(value.best.expected_value_percent)<1)reasons.push("EV_TOO_LOW");
  if(value?.best?.model_probability!=null&&Number(value.best.model_probability)<.58)reasons.push("LOW_MODEL_PROBABILITY");
  if(shotCount===0)reasons.push("LOW_EVENT_SAMPLE");
  const riskScore=Math.min(100,(min>=85?35:0)+(reds>0?30:0)+(Number(value?.best?.edge_percent)>18?20:0)+(shotCount===0?15:0));
  const risk=riskScore>=60?"HIGH":riskScore>=30?"MEDIUM":"LOW";
  const blocked=reasons.includes("LATE_MATCH")||reasons.includes("RED_CARD_VOLATILITY")||reasons.includes("EV_TOO_LOW")||reasons.includes("LOW_MODEL_PROBABILITY");
  const decision=blocked?"NO BET":value?.smart_decision||"NO BET";
  return{risk,risk_score:riskScore,blocked,reasons,decision};
}
function liveDecisionEngine(ctx:any){
  const intelligence=Number(ctx?.intelligence?.score)||0;
  const riskScore=Number(ctx?.risk?.risk_score)||0;
  const risk=String(ctx?.risk?.risk||"HIGH");
  const valueSignal=String(ctx?.value?.value_signal||"NO BET");
  const edge=Number(ctx?.value?.best?.edge_percent)||0;
  const ev=Number(ctx?.value?.best?.expected_value_percent)||0;
  const confidence=Number(ctx?.live_probability?.confidence)||0;
  const reasons:string[]=[];
  let score=Math.max(0,Math.min(100,intelligence*.35+confidence*.25+Math.max(0,Math.min(100,50+edge*2))*.25+Math.max(0,Math.min(100,50+ev*5))*.15-riskScore*.25));
  if(valueSignal==="VALUE")score+=5;
  if(valueSignal==="NO BET")reasons.push("NO_VALUE_SIGNAL");
  if(risk==="HIGH")reasons.push("HIGH_RISK");
  else if(risk==="MEDIUM")reasons.push("MEDIUM_RISK");
  if(intelligence<60)reasons.push("LOW_INTELLIGENCE");
  if(confidence<58)reasons.push("LOW_CONFIDENCE");
  if(edge<1||ev<1)reasons.push("WEAK_EDGE_EV");
  const decision=(risk==="HIGH"||valueSignal==="NO BET"||intelligence<60||confidence<58||edge<1||ev<1)?"NO BET":(valueSignal==="VALUE"&&score>=72)?"BET":(score>=62)?"LEAN":"NO BET";
  const strength=score>=78?"STRONG":score>=68?"GOOD":score>=58?"WATCH":"WEAK";
  return{score:Math.round(score),decision,strength,reasons,gate_passed:decision!=="NO BET",components:{intelligence:Math.round(intelligence),confidence:Math.round(confidence),edge:Number(edge.toFixed(1)),ev:Number(ev.toFixed(1)),risk:Math.round(riskScore)}};
}
function liveMarketValue(probabilities:any,odds:any,context:any={}){
  const p={home:Number(probabilities?.home),draw:Number(probabilities?.draw),away:Number(probabilities?.away)};
  const o={home:Number(odds?.home),draw:Number(odds?.draw),away:Number(odds?.away)};
  const keys=["home","draw","away"].filter(k=>Number.isFinite(p[k])&&Number.isFinite(o[k])&&o[k]>1);
  if(keys.length<2)return{status:"NO_MARKET",reason:"Insufficient live 1X2 odds",value_signal:"NO MARKET",smart_decision:"NO BET",risk:liveRiskGate(null,context.minute,context.red_cards,context.shots)};
  const raw=keys.map(k=>1/o[k]);const sum=raw.reduce((a,b)=>a+b,0);
  const fair:any={};for(const k of keys)fair[k]=raw[keys.indexOf(k)]/sum;
  const rows=keys.map(k=>({selection:k==="home"?"1":k==="draw"?"X":"2",odds:o[k],model_probability:p[k],fair_probability:fair[k],edge_percent:(p[k]-fair[k])*100,expected_value_percent:(p[k]*o[k]-1)*100}));
  rows.sort((a,b)=>b.edge_percent-a.edge_percent);
  const best=rows[0];
  const signal=best.expected_value_percent>=3&&best.edge_percent>=3?"VALUE":best.expected_value_percent>=1&&best.edge_percent>=1?"LEAN":"NO BET";
  const base={status:"OK",best,rows,overround_percent:(sum-1)*100,value_signal:signal,smart_decision:signal==="VALUE"?"BET":signal==="LEAN"?"LEAN":"NO BET"};
  const risk=liveRiskGate(base,context.minute,context.red_cards,context.shots);
  return{...base,risk,smart_decision:risk.decision,value_signal:risk.blocked?"NO BET":signal};
}
function liveOutcomeProbabilities(homeScore:number,awayScore:number,minute:number,homeXg:any,awayXg:any,pre:any){
  const hs=Math.max(0,Math.floor(Number(homeScore)||0)),as=Math.max(0,Math.floor(Number(awayScore)||0));
  const min=Math.max(0,Math.min(120,Number(minute)||0));
  const baseH=Number(homeXg),baseA=Number(awayXg);
  const p=normalize3(pre)||[1/3,1/3,1/3];
  const totalXg=Number.isFinite(baseH)&&Number.isFinite(baseA)&&baseH>=0&&baseA>=0?baseH+baseA:2.5;
  const share=Number.isFinite(baseH)&&Number.isFinite(baseA)&&baseH+baseA>0?baseH/(baseH+baseA):Math.max(.2,Math.min(.8,p[0]+p[2]*.15));
  const elapsed=Math.min(1,min/90);
  const remaining=Math.max(0,1-elapsed);
  const rh=Math.max(.05,totalXg*share*remaining);
  const ra=Math.max(.05,totalXg*(1-share)*remaining);
  const ph=(k:number)=>poisson(rh,k),pa=(k:number)=>poisson(ra,k);
  let home=0,draw=0,away=0;
  for(let i=0;i<=10;i++)for(let j=0;j<=10;j++){
    const prob=ph(i)*pa(j),fh=hs+i,fa=as+j;
    if(fh>fa)home+=prob;else if(fh===fa)draw+=prob;else away+=prob;
  }
  const probs=normalize3({home,draw,away})||p;
  const prediction=probs[0]>=probs[1]&&probs[0]>=probs[2]?"1":probs[2]>=probs[1]?"2":"X";
  return{probabilities:{home:Number(probs[0].toFixed(4)),draw:Number(probs[1].toFixed(4)),away:Number(probs[2].toFixed(4))},prediction,confidence:Math.round(Math.max(...probs)*100),remaining_xg:{home:Number(rh.toFixed(2)),away:Number(ra.toFixed(2))},method:"live_score_state_poisson_v1"};
}
async function trackLiveSignal(prediction:any,ctx:any){
  if(!prediction?.id)return{tracked:false,reason:"NO_OPEN_PREDICTION"};
  const previous=prediction.reasoning&&typeof prediction.reasoning==="object"?prediction.reasoning:{};
  const history=Array.isArray(previous.live_tracking)?previous.live_tracking:[];
  const snap={
    captured_at:new Date().toISOString(),
    minute:Number(ctx.minute)||0,
    score:ctx.score,
    live_probability:ctx.live_probability?.probabilities||null,
    live_prediction:ctx.live_probability?.prediction||null,
    live_confidence:ctx.live_probability?.confidence??null,
    intelligence_score:ctx.live_intelligence?.score??null,
    momentum:ctx.live_intelligence?.momentum??null,
    regime:ctx.live_intelligence?.regime||null,
    edge:ctx.live_value?.best?.edge_percent??null,
    ev:ctx.live_value?.best?.expected_value_percent??null,
    odds:ctx.live_value?.best?.odds??null,
    selection:ctx.live_value?.best?.selection??null,
    value_signal:ctx.live_value?.value_signal||"NO MARKET",
    risk:ctx.live_risk?.risk||null,
    risk_score:ctx.live_risk?.risk_score??null,
    decision:ctx.live_decision?.decision||"NO BET",
    decision_score:ctx.live_decision?.score??null
  };
  const last=history[history.length-1];
  if(last&&last.minute===snap.minute&&last.score?.home===snap.score?.home&&last.score?.away===snap.score?.away&&last.decision===snap.decision)return{tracked:true,duplicate:true,samples:history.length};
  const next=[...history,snap].slice(-180);
  const reasoning={...previous,live_tracking:next,live_tracking_version:"v5.7"};
  const q=await sb.from("football_ai_predictions").update({reasoning}).eq("id",prediction.id);
  if(q.error)return{tracked:false,error:q.error.message,samples:history.length};
  return{tracked:true,duplicate:false,samples:next.length};
}
async function liveAlertEngine(ctx:any){
  const decision=String(ctx?.decision?.decision||"NO BET");
  const strength=String(ctx?.decision?.strength||"WEAK");
  const score=Number(ctx?.decision?.score)||0;
  const intelligence=Number(ctx?.intelligence?.score)||0;
  const confidence=Number(ctx?.probability?.confidence)||0;
  const valueSignal=String(ctx?.value?.value_signal||"NO MARKET");
  const edge=Number(ctx?.value?.best?.edge_percent)||0;
  const ev=Number(ctx?.value?.best?.expected_value_percent)||0;
  const risk=String(ctx?.risk?.risk||"HIGH");
  const minute=Number(ctx?.minute)||0;
  const reasons:string[]=[];
  if(decision==="BET"&&strength!=="WEAK"&&score>=72&&intelligence>=60&&confidence>=58&&valueSignal==="VALUE"&&edge>=3&&ev>=3&&risk!=="HIGH"){
    return{status:"LIVE_OPPORTUNITY",active:true,level:"HIGH",title:"LIVE OPPORTUNITY",score:Math.round(score),reasons:["DECISION_GATE_PASSED","VALUE_SIGNAL_ACTIVE","POSITIVE_EDGE_EV"],expires_after_minute:85};
  }
  if(decision==="LEAN"&&score>=62&&intelligence>=60&&confidence>=58&&valueSignal!=="NO BET"&&edge>=1&&ev>=1&&risk!=="HIGH"){
    return{status:"WATCH",active:false,level:"MEDIUM",title:"LIVE WATCH",score:Math.round(score),reasons:["LEAN_SIGNAL","POSITIVE_VALUE","NOT_STRONG_ENOUGH_FOR_ALERT"]};
  }
  if(minute>=85)reasons.push("LATE_MATCH");
  if(risk==="HIGH")reasons.push("HIGH_RISK");
  if(valueSignal==="NO BET"||valueSignal==="NO MARKET")reasons.push("NO_VALUE_SIGNAL");
  if(edge<1||ev<1)reasons.push("WEAK_EDGE_EV");
  if(intelligence<60)reasons.push("LOW_INTELLIGENCE");
  if(confidence<58)reasons.push("LOW_CONFIDENCE");
  return{status:"SIGNAL_INVALIDATED",active:false,level:"BLOCKED",title:"SIGNAL INVALIDATED",score:Math.round(score),reasons};
}
async function liveSettlement(){
  const {data:preds}=await sb.from("football_ai_predictions").select("id,match_id,prediction,reasoning,status,created_at").limit(500);
  if(!preds?.length)return{checked:0,settled:0};
  const ids=preds.map((x:any)=>x.match_id).filter(Boolean);
  const {data:matches}=await sb.from("football_matches").select("id,status,home_score,away_score").in("id",ids);
  let settled=0;
  for(const p of preds){
    const m=(matches||[]).find((x:any)=>x.id===p.match_id);
    if(!m||m.home_score==null||m.away_score==null||VOID.has(String(m.status||"").toLowerCase()))continue;
    const actual=Number(m.home_score)>Number(m.away_score)?"1":Number(m.home_score)<Number(m.away_score)?"2":"X";
    const tracking=Array.isArray(p.reasoning?.live_tracking)?p.reasoning.live_tracking:[];
    if(!tracking.length)continue;
    const updates=tracking.map((s:any)=>({...s,actual_result:actual,settled_at:new Date().toISOString(),outcome:s.live_prediction===actual?"WON":"LOST"}));
    const settledAt=new Date().toISOString();
    const settledUpdates=updates.map((s:any)=>{const actionable=s.decision==="BET"||s.decision==="LEAN";const won=s.live_prediction===actual;const odds=Number(s.odds);return{...s,actual_result:actual,settled_at:settledAt,outcome:won?"WON":"LOST",actionable,pnl:actionable&&Number.isFinite(odds)&&odds>1?(won?odds-1:-1):0}});
    const reasoning={...p.reasoning,live_tracking:settledUpdates,live_settled_result:actual,live_settled_at:settledAt,live_tracking_version:"v5.9"};
    await sb.from("football_ai_predictions").update({reasoning}).eq("id",p.id);
    settled++;
  }
  return{checked:preds.length,settled};
}
async function liveMatchEngine(){
  const {end}=todayBounds();
  const from=new Date(Date.now()-6*3600000).toISOString();
  const readRecent=async()=>{const {data,error}=await sb.from("football_matches").select("id,home_team,away_team,league,kickoff_at,status,home_score,away_score").gte("kickoff_at",from).lt("kickoff_at",end.toISOString()).order("kickoff_at",{ascending:true}).limit(200);if(error)throw error;return data||[]};
  const isLiveStatus=(value:any)=>{const s=String(value||"").trim().toUpperCase().replace(/[^A-Z0-9]+/g," ").trim();if(!s||/NOT STARTED|NOT START|NS|SCHEDULED|CANCELLED|POSTPONED|FINISHED|FULL TIME|AFTER EXTRA|AFTER PENALTIES/.test(s))return false;return new Set(["LIVE","1H","HT","2H","ET","P","BREAK","INPLAY","IN PLAY","PLAYING","FIRST HALF","1ST HALF","HALF TIME","HALFTIME","SECOND HALF","2ND HALF","EXTRA TIME","PENALTIES","LIVE 1ST HALF","LIVE 2ND HALF"]).has(s)||s.includes("LIVE")||s.includes("IN PLAY")||s.includes("FIRST HALF")||s.includes("SECOND HALF")||s.includes("HALF TIME")};
  let matches=await readRecent();
  let live=matches.filter((m:any)=>isLiveStatus(m.status));
  // If the database has no live-state rows, refresh provider fixtures once before declaring the feed empty.
  if(!live.length&&footballConfigured()){try{await syncExternalData(false);matches=await readRecent();live=matches.filter((m:any)=>isLiveStatus(m.status))}catch(e){console.error("Live fixture refresh failed",e)}}
  if(!live.length)return{status:"NO_LIVE_MATCHES",checked:matches.length,updated_at:new Date().toISOString(),matches:[]};
  const token=env("SPORTMONKS_API_TOKEN")||env("SPORT_API_KEY");
  const base=env("SPORTMONKS_API_BASE_URL","https://api.sportmonks.com/v3/football");
  const outRows:any[]=[];
  for(const m of live){
    let provider:any=null;let providerError=null;
    if(token){
      try{
        const q=(await jsonFetch(base+"/fixtures/between/"+apiDate(new Date(m.kickoff_at))+"/"+apiDate(new Date(m.kickoff_at))+"?api_token="+encodeURIComponent(token)+"&include=participants;scores;events.type;statistics.type;league;state&timezone=Europe%2FOslo&per_page=100",{headers:{accept:"application/json"}},12000)).data;
        provider=(Array.isArray(q?.data)?q.data:[]).find((f:any)=>String(f.id)===String(m.id)||String(f?.participants?.[0]?.name||"").toLowerCase()===String(m.home_team).toLowerCase()&&String(f?.participants?.[1]?.name||"").toLowerCase()===String(m.away_team).toLowerCase());
      }catch(e){providerError=e instanceof Error?e.message:String(e)}
    }
    const {data:openPrediction}=await sb.from("football_ai_predictions").select("prediction,confidence,reasoning").eq("match_id",m.id).eq("status","OPEN").order("created_at",{ascending:false}).limit(1).maybeSingle();
    let liveOdds:any=null;
    if(token){
      try{
        const oq=(await jsonFetch(base+"/odds/live/fixtures/"+encodeURIComponent(String(provider?.id||m.id))+"?api_token="+encodeURIComponent(token)+"&include=bookmaker;market",{headers:{accept:"application/json"}},10000)).data;
        const liveRows=Array.isArray(oq?.data)?oq.data:[];
        const prices:any={};
        for(const o of liveRows){
          const desc=String(o.market_description||o.market?.name||"").toLowerCase(),label=String(o.label||o.name||"").trim().toLowerCase();
          if(!/fulltime result|match winner|1x2/.test(desc))continue;
          const price=Number(o.value);if(!Number.isFinite(price)||price<=1)continue;
          const k=label==="1"||label==="home"?"home":label==="x"||label==="draw"?"draw":label==="2"||label==="away"?"away":null;
          if(k&&!prices[k])prices[k]=price;
        }
        if(Object.keys(prices).length>=2)liveOdds=prices;
      }catch(e){providerError=providerError||("Live odds: "+(e instanceof Error?e.message:String(e)))}
    }
    const reasoning=openPrediction?.reasoning||{};
    const preProb=reasoning.ensemble_probabilities||null;
    const liveXgH=reasoning.xg_home,liveXgA=reasoning.xg_away;
    const scores=Array.isArray(provider?.scores)?provider.scores:[];const current=scores.find((s:any)=>String(s.description||s.type?.code||"").toUpperCase()==="CURRENT")||scores[0];
    const homeScore=current?.score?.goals??m.home_score??0;const awayScore=scores.find((s:any)=>s.participant_id===provider?.participants?.find((p:any)=>p.meta?.location==="away")?.id)?.score?.goals??m.away_score??0;
    const events=Array.isArray(provider?.events)?provider.events:[];const stats=Array.isArray(provider?.statistics)?provider.statistics:[];
    const minute=events.reduce((max:number,e:any)=>Math.max(max,Number(e.minute||e.minute_extra||0)),0);
    const goals=events.filter((e:any)=>/GOAL/i.test(String(e.type?.name||e.type?.developer_name||e.type||""))).length;
    const reds=events.filter((e:any)=>/RED/i.test(String(e.type?.name||e.type?.developer_name||e.type||""))).length;
    const shots=events.filter((e:any)=>/SHOT/i.test(String(e.type?.name||e.type?.developer_name||e.type||""))).length;
    const liveProb=liveOutcomeProbabilities(Number(homeScore)||0,Number(awayScore)||0,minute,liveXgH,liveXgA,preProb);
    const liveIntelligence=liveSignalIntelligence({minute,shots,goals,red_cards:reds,pre_prob:preProb,live_prob:liveProb.probabilities});
    const liveValue=liveMarketValue(liveProb.probabilities,liveOdds,{minute,red_cards:reds,shots});
    const liveDecision=liveDecisionEngine({intelligence:liveIntelligence,risk:liveValue?.risk,value:liveValue,live_probability:liveProb});
    const liveAlert=liveAlertEngine({decision:liveDecision,intelligence:liveIntelligence,risk:liveValue?.risk,value:liveValue,probability:liveProb,minute});
    const liveTracking=await trackLiveSignal(openPrediction,{minute,score:{home:Number(homeScore)||0,away:Number(awayScore)||0},live_probability:liveProb,live_intelligence:liveIntelligence,live_value:liveValue,live_risk:liveValue?.risk,live_decision:liveDecision});
    outRows.push({match_id:m.id,home_team:m.home_team,away_team:m.away_team,league:m.league,kickoff_at:m.kickoff_at,status:provider?.state?.developer_name||m.status,minute,score:{home:Number(homeScore)||0,away:Number(awayScore)||0},events:{goals,red_cards:reds,shots},statistics:stats.length,provider_ok:Boolean(provider),provider_error:providerError,live_probability:liveProb,live_intelligence:liveIntelligence,live_odds:liveOdds,live_value:liveValue,live_risk:liveValue?.risk||null,live_decision:liveDecision,live_tracking:liveTracking,live_alert:liveAlert,pre_match_prediction:openPrediction?.prediction||null});
  }
  return{status:"OK",live_matches:outRows.length,updated_at:new Date().toISOString(),matches:outRows};
}
async function syncFootball(){
  const sportmonks=env("SPORTMONKS_API_TOKEN")||env("SPORT_API_KEY");
  const provider=env("FOOTBALL_PROVIDER","auto").toLowerCase();
  if((provider==="sportmonks"||provider==="auto")&&sportmonks){
    const base=env("SPORTMONKS_API_BASE_URL","https://api.sportmonks.com/v3/football");
    const {date:today}=todayBounds();const from=(()=>{const [y,m,d]=today.split("-").map(Number);return osloDate(new Date(Date.UTC(y,m-1,d-14,12,0,0)))})();const to=(()=>{const [y,m,d]=today.split("-").map(Number);return osloDate(new Date(Date.UTC(y,m-1,d+7,12,0,0)))})();
    let page=1,fixtures:any[]=[];
    try{
      for(let i=0;i<20;i++){
        const j=(await jsonFetch(base+"/fixtures/between/"+from+"/"+to+"?api_token="+encodeURIComponent(sportmonks)+"&include=participants;scores;league;state&timezone=Europe%2FOslo&per_page=50&page="+page,{headers:{accept:"application/json"}},12000)).data;
        const rows=Array.isArray(j?.data)?j.data:[];
        fixtures.push(...rows);
        if(!j?.pagination?.has_more||!rows.length)break;
        page++;
      }
    }catch(e){
      return{configured:true,provider:"sportmonks",synced:0,error:e instanceof Error?e.message:String(e)};
    }
    let synced=0,failed=0;
    for(const f of fixtures){
      const participants=Array.isArray(f.participants)?f.participants:[];
      const home=participants.find((p:any)=>p.meta?.location==="home"||p.location==="home")||participants[0];
      const away=participants.find((p:any)=>p.meta?.location==="away"||p.location==="away")||participants[1];
      const scores=Array.isArray(f.scores)?f.scores:[];
      const scoreCode=(s:any)=>String(s.description||s.type?.code||s.type?.name||"").toUpperCase().replace(/[^A-Z0-9]+/g,"_");
      const scoreFor=(participant:any,side:"home"|"away")=>{const own=scores.filter((s:any)=>String(s.participant_id??"")===String(participant?.id??"")||String(s.score?.participant||"").toLowerCase()===side);const preferred=own.find((s:any)=>["CURRENT","FULLTIME","FULL_TIME","FT","FULL_TIME_SCORE"].includes(scoreCode(s)));const selected=preferred||own[0];const value=selected?.score?.goals;return value===null||value===undefined||value===""?null:Number.isFinite(Number(value))?Number(value):null};
      const homeScore=scoreFor(home,"home"),awayScore=scoreFor(away,"away");
      const stateRaw=String(f.state?.short_name||f.state?.developer_name||f.state?.name||"NS").trim();
      const stateUpper=stateRaw.toUpperCase().replace(/[^A-Z0-9]+/g," ").trim();
      // Sportmonks fixture responses expose state_id at the fixture level; the nested state include may be absent.
      const stateId=Number(f.state_id??f.state?.id??f.state?.state_id);
      const finalState=new Set(["FT","AET","PEN","FT PEN","FT AET","FINISHED","MATCH FINISHED","FULL TIME","AFTER EXTRA TIME","AFTER PENALTIES","FINISHED AFTER EXTRA TIME","FINISHED AFTER PENALTIES"]).has(stateUpper)||stateUpper.includes("FINISHED")||[5,7,8].includes(stateId);
      const canonicalStatus=finalState?(stateId===8||stateUpper.includes("PEN")?"FT_PEN":stateId===7||stateUpper==="AET"||stateUpper.includes("EXTRA")?"AET":"FT"):stateRaw;
      const leagueName=String(f.league?.name||"");
      const row={home_team:home?.name,away_team:away?.name,league:"Europe · "+leagueName,kickoff_at:f.starting_at,status:canonicalStatus,home_score:homeScore,away_score:awayScore};
      if(!row.home_team||!row.away_team||!row.kickoff_at)continue;
      const fixtureTime=new Date(row.kickoff_at).getTime();const matchWindowStart=new Date(fixtureTime-36*60*60*1000).toISOString(),matchWindowEnd=new Date(fixtureTime+36*60*60*1000).toISOString();const {data:existingRows}=await sb.from("football_matches").select("id,home_team,away_team,kickoff_at").eq("home_team",row.home_team).eq("away_team",row.away_team).gte("kickoff_at",matchWindowStart).lte("kickoff_at",matchWindowEnd).limit(20);
      const existing=(existingRows||[]).sort((a:any,b:any)=>Math.abs(new Date(a.kickoff_at).getTime()-new Date(row.kickoff_at).getTime())-Math.abs(new Date(b.kickoff_at).getTime()-new Date(row.kickoff_at).getTime()))[0]; let q:any;
      if(existing?.id)q=await sb.from("football_matches").update(row).eq("id",existing.id);else q=await sb.from("football_matches").insert(row);
      if(q.error)failed++;else synced++;
    }
    const {data:recent}=await sb.from("football_matches").select("home_team,away_team,status,home_score,away_score").gte("kickoff_at",new Date(Date.now()-30*86400000).toISOString()).not("home_score","is",null).limit(3000);
    const agg=new Map<string,any>();
    for(const m of recent||[]){const hs=Number(m.home_score),as=Number(m.away_score);for(const side of ["home","away"]){const team=side==="home"?m.home_team:m.away_team;if(!team)continue;const gf=side==="home"?hs:as,ga=side==="home"?as:hs;const x=agg.get(norm(team))||{team_name:team,wins:0,losses:0,draws:0,goals_for:0,goals_against:0,xg_for:0,xg_against:0};x.goals_for+=gf;x.goals_against+=ga;if(gf>ga)x.wins++;else if(gf<ga)x.losses++;else x.draws++;agg.set(norm(team),x)}}
    let statsSynced=0;for(const x of agg.values()){const {data:old}=await sb.from("football_team_stats").select("id").eq("team_name",x.team_name).limit(1).maybeSingle();const q=old?.id?await sb.from("football_team_stats").update(x).eq("id",old.id):await sb.from("football_team_stats").insert(x);if(!q.error)statsSynced++}
    const data_intake=await sportmonksDataProbe(base,sportmonks,today);return{configured:true,provider:"sportmonks",synced,stats_synced:statsSynced,failed,total:fixtures.length,from,to,pages:page,data_intake};
  }
  const key=env("FOOTBALL_API_KEY"),base=env("FOOTBALL_API_BASE_URL","https://v3.football.api-sports.io");
  if(!key)return{configured:false,synced:0,error:"No football provider token configured"};
  const {date:today}=todayBounds();const fromDate=(()=>{const [y,m,d]=today.split("-").map(Number);return osloDate(new Date(Date.UTC(y,m-1,d-1,12,0,0)))})();const toDate=(()=>{const [y,m,d]=today.split("-").map(Number);return osloDate(new Date(Date.UTC(y,m-1,d+7,12,0,0)))})();let payload:any;
  try{payload=(await jsonFetch(base+"/fixtures?from="+fromDate+"&to="+toDate+"&timezone=Europe%2FOslo",{headers:{"x-apisports-key":key,"accept":"application/json"}})).data}catch(e){return{configured:true,provider:"api-football",synced:0,error:e instanceof Error?e.message:String(e)}}
  if(payload?.errors&&Object.keys(payload.errors).length)return{configured:true,provider:"api-football",synced:0,error:JSON.stringify(payload.errors)};
  const fixtures=Array.isArray(payload?.response)?payload.response:[];let synced=0,failed=0;
  for(const f of fixtures){const row={home_team:f.teams?.home?.name,away_team:f.teams?.away?.name,league:String(f.league?.country||"")+" · "+String(f.league?.name||""),kickoff_at:f.fixture?.date,status:f.fixture?.status?.short,home_score:f.goals?.home,away_score:f.goals?.away};if(!row.home_team||!row.away_team||!european(row))continue;const fixtureTime=new Date(row.kickoff_at).getTime();const matchWindowStart=new Date(fixtureTime-36*60*60*1000).toISOString(),matchWindowEnd=new Date(fixtureTime+36*60*60*1000).toISOString();const {data:existingRows}=await sb.from("football_matches").select("id,home_team,away_team,kickoff_at").eq("home_team",row.home_team).eq("away_team",row.away_team).gte("kickoff_at",matchWindowStart).lte("kickoff_at",matchWindowEnd).limit(20);const existing=(existingRows||[]).sort((a:any,b:any)=>Math.abs(new Date(a.kickoff_at).getTime()-new Date(row.kickoff_at).getTime())-Math.abs(new Date(b.kickoff_at).getTime()-new Date(row.kickoff_at).getTime()))[0];let q:any;if(existing?.id)q=await sb.from("football_matches").update(row).eq("id",existing.id);else q=await sb.from("football_matches").insert(row);if(q.error)failed++;else synced++}
  const {data:recent}=await sb.from("football_matches").select("home_team,away_team,status,home_score,away_score").gte("kickoff_at",new Date(Date.now()-30*86400000).toISOString()).not("home_score","is",null).limit(3000);const agg=new Map<string,any>();for(const m of recent||[]){const hs=Number(m.home_score),as=Number(m.away_score);for(const side of ["home","away"]){const team=side==="home"?m.home_team:m.away_team;if(!team)continue;const gf=side==="home"?hs:as,ga=side==="home"?as:hs;const x=agg.get(norm(team))||{team_name:team,wins:0,losses:0,draws:0,goals_for:0,goals_against:0,xg_for:0,xg_against:0};x.goals_for+=gf;x.goals_against+=ga;if(gf>ga)x.wins++;else if(gf<ga)x.losses++;else x.draws++;agg.set(norm(team),x)}}let statsSynced=0;for(const x of agg.values()){const {data:old}=await sb.from("football_team_stats").select("id").eq("team_name",x.team_name).limit(1).maybeSingle();const q=old?.id?await sb.from("football_team_stats").update(x).eq("id",old.id):await sb.from("football_team_stats").insert(x);if(!q.error)statsSynced++}return{configured:true,provider:"api-football",synced,stats_synced:statsSynced,failed,total:fixtures.length,from:apiDate(from),to:apiDate(to),data_intake:{status:"LEGACY_PROVIDER",note:"Phase 1 probe is implemented for Sportmonks; API-Football remains fallback."}};
}
function normalizeOddsMarket(market:string,selection:string,total:any){
  const m=String(market||"").toLowerCase(),s=String(selection||"").trim().toLowerCase(),t=Number(total);
  if(/fulltime result|match winner/.test(m)&&/^(1|x|2|home|draw|away)$/.test(s))return{market:"h2h",selection:s==="home"?"1":s==="draw"?"X":s==="away"?"2":s};
  if(/double chance/.test(m)&&/^(1x|x2|12)$/.test(s))return{market:"double_chance",selection:s.toUpperCase()};
  if(/both teams to score|btts/.test(m)&&/^(yes|no)$/.test(s))return{market:"btts",selection:s.toUpperCase()};
  if(/goals over\/under|over\/under|match goals/.test(m)){
    const line=Number.isFinite(t)?t:Number((s.match(/(?:over|under)\s*([0-9.]+)/i)||[])[1]);
    if(Math.abs(line-2.5)<0.01&&/^(over|under)/.test(s))return{market:"ou_2_5",selection:s.startsWith("over")?"OVER 2.5":"UNDER 2.5"};
  }
  return null;
}
async function persistOdd(row:any){
  const {data:oldOdds}=await sb.from("football_odds").select("id").eq("match_id",row.match_id).eq("market",row.market).eq("selection",row.selection).eq("bookmaker",row.bookmaker).limit(1).maybeSingle();
  return oldOdds?.id?await sb.from("football_odds").update(row).eq("id",oldOdds.id):await sb.from("football_odds").insert(row);
}
async function syncOdds(){
  const sportmonks=env("SPORTMONKS_API_TOKEN")||env("SPORT_API_KEY");
  const footballKey=env("FOOTBALL_API_KEY");
  const {date:today,start}=todayBounds();const endDate=(()=>{const [y,m,d]=today.split("-").map(Number);return osloDate(new Date(Date.UTC(y,m-1,d+8,12,0,0)))})();const end=osloMidnight(endDate);
  const {data:matches}=await sb.from("football_matches").select("id,home_team,away_team,kickoff_at").gte("kickoff_at",start.toISOString()).lt("kickoff_at",end.toISOString()).limit(1500);
  const list=matches||[];
  if(sportmonks){
    const base=env("SPORTMONKS_API_BASE_URL","https://api.sportmonks.com/v3/football");
    let fixtures:any[]=[];let page=1;
    try{
      for(let i=0;i<20;i++){
        const to=(()=>{const [y,m,d]=today.split("-").map(Number);return osloDate(new Date(Date.UTC(y,m-1,d+7,12,0,0)))})();const j=(await jsonFetch(base+"/fixtures/between/"+today+"/"+to+"?api_token="+encodeURIComponent(sportmonks)+"&include=participants;league;state&timezone=Europe%2FOslo&per_page=50&page="+page,{headers:{accept:"application/json"}},12000)).data;
        const rows=Array.isArray(j?.data)?j.data:[];
        fixtures.push(...rows);
        if(!j?.pagination?.has_more||!rows.length)break;
        page++;
      }
    }catch(e){return{configured:true,provider:"sportmonks",synced:0,error:e instanceof Error?e.message:String(e)}}
    let synced=0,failed=0,events=0,fixturesMatched=0,markets={h2h:0,double_chance:0,btts:0,ou_2_5:0};
    for(const f of fixtures){
      const participants=Array.isArray(f.participants)?f.participants:[];
      const home=participants.find((p:any)=>p.meta?.location==="home"||p.location==="home")||participants[0];
      const away=participants.find((p:any)=>p.meta?.location==="away"||p.location==="away")||participants[1];
      const kickoff=f.starting_at;
      if(!home?.name||!away?.name||!kickoff)continue;
      const match=list.find((m:any)=>norm(m.home_team)===norm(home.name)&&norm(m.away_team)===norm(away.name)&&Math.abs(new Date(m.kickoff_at).getTime()-new Date(kickoff).getTime())<4*3600000);
      if(!match)continue;
      fixturesMatched++;
      let payload:any;
      try{payload=(await jsonFetch(base+"/odds/pre-match/fixtures/"+encodeURIComponent(String(f.id))+"?api_token="+encodeURIComponent(sportmonks)+"&include=bookmaker;market",{headers:{accept:"application/json"}},12000)).data}catch{continue}
      for(const o of (Array.isArray(payload?.data)?payload.data:[])){
        events++;
        const normalized=normalizeOddsMarket(String(o.market_description||o.market?.name||""),String(o.label||o.name||""),o.total);
        if(!normalized)continue;
        const price=Number(o.value);if(!Number.isFinite(price)||price<=1)continue;
        const row={match_id:match.id,market:normalized.market,selection:normalized.selection,odds:price,bookmaker:String(o.bookmaker?.name||o.bookmaker_id||"Sportmonks"),captured_at:o.latest_bookmaker_update||o.updated_at||new Date().toISOString()};
        const q=await persistOdd(row);
        if(q.error)failed++;else{synced++;markets[normalized.market as keyof typeof markets]++}
      }
    }
    return{configured:true,provider:"sportmonks",synced,failed,events,fixtures:fixturesMatched,total_fixtures:fixtures.length,pages:page,markets};
  }
  if(footballKey){
    const base=env("FOOTBALL_API_BASE_URL","https://v3.football.api-sports.io");
    let fixtures:any[]=[];
    try{
      const payload=(await jsonFetch(base+"/fixtures?from="+today+"&to="+(()=>{const [y,m,d]=today.split("-").map(Number);return osloDate(new Date(Date.UTC(y,m-1,d+7,12,0,0)))})()+"&timezone=Europe%2FOslo",{headers:{"x-apisports-key":footballKey,accept:"application/json"}},12000)).data;
      fixtures=Array.isArray(payload?.response)?payload.response:[];
    }catch(e){return{configured:true,provider:"api-football",synced:0,error:e instanceof Error?e.message:String(e)}}
    let synced=0,failed=0,events=0,fixturesMatched=0,markets={h2h:0,double_chance:0,btts:0,ou_2_5:0};
    for(const f of fixtures){
      const home=f.teams?.home?.name,away=f.teams?.away?.name,kickoff=f.fixture?.date;
      if(!home||!away||!kickoff||!european({home_team:home,away_team:away,league:String(f.league?.country||"")+" · "+String(f.league?.name||"")}))continue;
      const match=list.find((m:any)=>norm(m.home_team)===norm(home)&&norm(m.away_team)===norm(away)&&Math.abs(new Date(m.kickoff_at).getTime()-new Date(kickoff).getTime())<4*3600000);
      if(!match)continue;
      fixturesMatched++;
      let payload:any;
      try{payload=(await jsonFetch(base+"/odds?fixture="+encodeURIComponent(String(f.fixture?.id)),{headers:{"x-apisports-key":footballKey,accept:"application/json"}},12000)).data}catch{continue}
      const bookmakers=Array.isArray(payload?.response?.[0]?.bookmakers)?payload.response[0].bookmakers:[];
      for(const bm of bookmakers)for(const market of (bm.bets||[])){
        for(const o of (market.values||[])){
          const normalized=normalizeOddsMarket(String(market.name||""),String(o.value||""),null);
          if(!normalized)continue;
          const price=Number(o.odd);if(!Number.isFinite(price)||price<=1)continue;
          events++;
          const row={match_id:match.id,market:normalized.market,selection:normalized.selection,odds:price,bookmaker:String(bm.name||bm.id||"API-Football"),captured_at:new Date().toISOString()};
          const q=await persistOdd(row);
          if(q.error)failed++;else{synced++;markets[normalized.market as keyof typeof markets]++}
        }
      }
    }
    return{configured:true,provider:"api-football",synced,failed,events,fixtures:fixturesMatched,total_fixtures:fixtures.length,markets};
  }
  return{configured:false,synced:0,error:"No football provider token configured for odds"};
}
const footballConfigured=()=>Boolean(env("SPORTMONKS_API_TOKEN")||env("SPORT_API_KEY")||env("FOOTBALL_API_KEY"));
const oddsConfigured=()=>Boolean(env("SPORTMONKS_API_TOKEN")||env("SPORT_API_KEY")||env("FOOTBALL_API_KEY"));
async function dataIntakeAudit(){
  const {date:today,start,end}=todayBounds();
  const sportmonks=env("SPORTMONKS_API_TOKEN")||env("SPORT_API_KEY");
  const {count:matchCount}=await sb.from("football_matches").select("*",{count:"exact",head:true});
  const {count:oddsCount}=await sb.from("football_odds").select("*",{count:"exact",head:true});
  const {count:statsCount}=await sb.from("football_team_stats").select("*",{count:"exact",head:true});
  const {count:todayMatchCount}=await sb.from("football_matches").select("*",{count:"exact",head:true}).gte("kickoff_at",start.toISOString()).lt("kickoff_at",end.toISOString());
  const {count:todayOddsCount}=await sb.from("football_odds").select("*",{count:"exact",head:true}).gte("captured_at",start.toISOString()).lt("captured_at",end.toISOString());
  let provider_probe:any;
  if(sportmonks){
    provider_probe=await sportmonksDataProbe(env("SPORTMONKS_API_BASE_URL","https://api.sportmonks.com/v3/football"),sportmonks,today);
  }else{
    provider_probe={status:"NO_PROVIDER",error:"No Sportmonks token configured for Phase 1 probe"};
  }
  return{
    date:today,
    stored_matches:matchCount||0,
    team_stats:statsCount||0,
    today_matches:todayMatchCount||0,
    today_odds:todayOddsCount||0,
    provider_probe,
    ready:{
      fixtures:Boolean(provider_probe?.available?.fixtures),
      form_stats:(statsCount||0)>0,
      odds:(oddsCount||0)>0
    },
    audited_at:new Date().toISOString()
  };
}
async function syncExternalData(force=false){const now=Date.now();const football=force||now-lastFootballSync>10*60*1000?await syncFootball():{configured:footballConfigured(),skipped:true};if(football.configured&&!football.error)lastFootballSync=now;const odds=force||now-lastOddsSync>30*60*1000?await syncOdds():{configured:oddsConfigured(),skipped:true};if(odds.configured&&!odds.error)lastOddsSync=now;const {count:matchCount}=await sb.from("football_matches").select("*",{count:"exact",head:true});const {count:oddsCount}=await sb.from("football_odds").select("*",{count:"exact",head:true});const {count:statsCount}=await sb.from("football_team_stats").select("*",{count:"exact",head:true});const {date:today,start,end}=todayBounds();const {count:todayMatchCount}=await sb.from("football_matches").select("*",{count:"exact",head:true}).gte("kickoff_at",start.toISOString()).lt("kickoff_at",end.toISOString());const {count:todayOddsCount}=await sb.from("football_odds").select("*",{count:"exact",head:true}).gte("captured_at",start.toISOString()).lt("captured_at",end.toISOString());return{football,odds,database:{football_matches:matchCount||0,football_odds:oddsCount||0,football_team_stats:statsCount||0},data_intake:{date:today,stored_matches:matchCount||0,team_stats:statsCount||0,today_matches:todayMatchCount||0,today_odds:todayOddsCount||0,provider_probe:football?.data_intake||null,ready:{fixtures:Boolean((football as any)?.configured&&!((football as any)?.error)),form_stats:(statsCount||0)>0,odds:(todayOddsCount||0)>0}},synced_at:new Date().toISOString()}}
async function connectivity(){const {count:matchCount,error:matchError}=await sb.from("football_matches").select("*",{count:"exact",head:true});const {count:oddsCount,error:oddsError}=await sb.from("football_odds").select("*",{count:"exact",head:true});const {count:statsCount,error:statsError}=await sb.from("football_team_stats").select("*",{count:"exact",head:true});const providers={football_api:footballConfigured(),odds_api:oddsConfigured(),groq:Boolean(env("GROQ_API_KEY")),openai:Boolean(env("OPENAI_API_KEY"))};const dbError=matchError||oddsError||statsError;const aiAvailable=providers.groq||providers.openai;const status=dbError?"DEGRADED":providers.football_api&&providers.odds_api&&aiAvailable?"HEALTHY":"DEGRADED";return{status,providers,database:{football_matches:matchCount||0,football_odds:oddsCount||0,football_team_stats:statsCount||0,status:dbError?"DEGRADED":"HEALTHY"},provider_status:{football_api:providers.football_api?"CONFIGURED":"OFFLINE",odds_api:providers.odds_api?"CONFIGURED":"OFFLINE",groq:providers.groq?"CONFIGURED":"OFFLINE",openai:providers.openai?"CONFIGURED":"OFFLINE"},updated_at:new Date().toISOString()}}
async function diagnostics(){const checkedAt=new Date().toISOString();const result:any={checked_at:checkedAt,providers:{},database:{},sync:{football_last_ok:lastFootballSync?new Date(lastFootballSync).toISOString():null,odds_last_ok:lastOddsSync?new Date(lastOddsSync).toISOString():null}};
const db=await sb.from("football_matches").select("*",{count:"exact",head:true});const od=await sb.from("football_odds").select("*",{count:"exact",head:true});const st=await sb.from("football_team_stats").select("*",{count:"exact",head:true});
result.database={football_matches:db.count||0,football_odds:od.count||0,football_team_stats:st.count||0,status:db.error||od.error||st.error?"DEGRADED":"HEALTHY"};
const sportmonks=env("SPORTMONKS_API_TOKEN")||env("SPORT_API_KEY");if(sportmonks){try{const {date:today}=todayBounds();await jsonFetch(env("SPORTMONKS_API_BASE_URL","https://api.sportmonks.com/v3/football")+"/fixtures/between/"+today+"/"+today+"?api_token="+encodeURIComponent(sportmonks)+"&timezone=Europe%2FOslo&per_page=1",{headers:{accept:"application/json"}},9000);result.providers.football_api={status:"CONNECTED",provider:"Sportmonks",detail:"Fixtures endpoint OK · auth + plan access confirmed"}}catch(e){result.providers.football_api={status:"ERROR",provider:"Sportmonks",detail:e instanceof Error?e.message:String(e)}}}else if(env("FOOTBALL_API_KEY")){try{await jsonFetch(env("FOOTBALL_API_BASE_URL","https://v3.football.api-sports.io")+"/status",{headers:{"x-apisports-key":env("FOOTBALL_API_KEY"),accept:"application/json"}},9000);result.providers.football_api={status:"CONNECTED",provider:"API-Football",detail:"Live API handshake OK"}}catch(e){result.providers.football_api={status:"ERROR",provider:"API-Football",detail:e instanceof Error?e.message:String(e)}}}else result.providers.football_api={status:"OFFLINE",provider:"—",detail:"Ingen football API-secret"};
if(sportmonks){try{await jsonFetch(env("SPORTMONKS_API_BASE_URL","https://api.sportmonks.com/v3/football")+"/odds/pre-match?api_token="+encodeURIComponent(sportmonks)+"&per_page=1",{headers:{accept:"application/json"}},9000);result.providers.odds_api={status:"CONNECTED",provider:"Sportmonks Odds",detail:"Pre-match odds endpoint OK · Odds add-on access confirmed"}}catch(e){result.providers.odds_api={status:"ERROR",provider:"Sportmonks Odds",detail:e instanceof Error?e.message:String(e)}}}else if(env("FOOTBALL_API_KEY")){try{await jsonFetch(env("FOOTBALL_API_BASE_URL","https://v3.football.api-sports.io")+"/status",{headers:{"x-apisports-key":env("FOOTBALL_API_KEY"),accept:"application/json"}},9000);result.providers.odds_api={status:"CONNECTED",provider:"API-Football Odds",detail:"Football API auth OK · odds provider fallback active"}}catch(e){result.providers.odds_api={status:"ERROR",provider:"API-Football Odds",detail:e instanceof Error?e.message:String(e)}}}else result.providers.odds_api={status:"OFFLINE",provider:"—",detail:"Ingen football provider-secret"};
if(env("GROQ_API_KEY")){try{await jsonFetch("https://api.groq.com/openai/v1/models",{headers:{authorization:"Bearer "+env("GROQ_API_KEY")},},9000);result.providers.groq={status:"CONNECTED",provider:"Groq",detail:"Auth handshake OK"}}catch(e){result.providers.groq={status:"ERROR",provider:"Groq",detail:e instanceof Error?e.message:String(e)}}}else result.providers.groq={status:"OFFLINE",provider:"—",detail:"GROQ_API_KEY mangler"};
if(env("OPENAI_API_KEY")){try{await jsonFetch("https://api.openai.com/v1/models",{headers:{authorization:"Bearer "+env("OPENAI_API_KEY")}},9000);result.providers.openai={status:"CONNECTED",provider:"OpenAI",detail:"Auth handshake OK"}}catch(e){result.providers.openai={status:"ERROR",provider:"OpenAI",detail:e instanceof Error?e.message:String(e)}}}else result.providers.openai={status:"OFFLINE",provider:"—",detail:"OPENAI_API_KEY mangler"};
const providerStatuses=Object.values(result.providers).map((x:any)=>x?.status);const providerErrors=providerStatuses.filter((x:any)=>x==="ERROR"||x==="OFFLINE").length;const databaseDegraded=result.database?.status!=="HEALTHY";const aiReady=result.providers.groq?.status==="CONNECTED"||result.providers.openai?.status==="CONNECTED";const dataReady=result.providers.football_api?.status==="CONNECTED"&&result.providers.odds_api?.status==="CONNECTED";result.status=databaseDegraded||providerErrors||!aiReady||!dataReady?"DEGRADED":"HEALTHY";return result}
function marketValue(prediction:string,oddsRows:any[]){const wanted=String(prediction||"").toUpperCase();const rows=(oddsRows||[]).filter((x:any)=>String(x.selection||"").toUpperCase()===wanted&&Number(x.odds)>1);if(!rows.length)return null;return rows.reduce((a:any,b:any)=>Number(b.odds)>Number(a.odds)?b:a)}
async function top6(force=false){const {date:today,start,end}=todayBounds();const batchId="day-"+today;const {data:cached,error:cachedError}=force?{data:[],error:null}:await sb.from("football_ai_predictions").select("id,match_id,prediction,selected_outcome,confidence,odds,value_percent,provider,model,status,reasoning,created_at").order("created_at",{ascending:false}).limit(500);if(cachedError)throw cachedError;const cachedBatch=(cached||[]).filter((p:any)=>String(p?.reasoning?.batch_id||"")===batchId).slice(0,6);const cacheReady=cachedBatch.length>0&&cachedBatch.every((x:any)=>Number.isFinite(Number(x?.reasoning?.engine_score))&&Number.isFinite(Number(x?.reasoning?.final_score))&&String(x?.reasoning?.engine_prediction||"").length>0&&String(x?.reasoning?.ensemble_prediction||"").length>0);if(cachedBatch.length){const ids=cachedBatch.map((x:any)=>x.match_id).filter(Boolean);const {data:cachedMatches}=ids.length?await sb.from("football_matches").select("*").in("id",ids):{data:[]};const matches=new Map((cachedMatches||[]).map((m:any)=>[m.id,m]));const seenCached=new Set<string>();const uniqueCached=cachedBatch.filter((p:any)=>{const m=matches.get(p.match_id);if(!m)return false;const key=[norm(m.home_team),norm(m.away_team),m.kickoff_at?String(m.kickoff_at).slice(0,10):String(m.league||"")].join("|");if(seenCached.has(key))return false;seenCached.add(key);return true});if(uniqueCached.length&&(cacheReady||!force)){return{matches_scanned:uniqueCached.length,top6:uniqueCached.map((p:any)=>{const m=matches.get(p.match_id);if(!m)return null;const conf=Number(p.confidence||0),reasoning=p.reasoning||{};return{...m,ai:{prediction:p.prediction,confidence:conf,probabilities:reasoning.ensemble_probabilities||{home:0,draw:0,away:0},value_percent:p.value_percent,provider:p.provider,model:p.model},prediction:p,cached:true}}).filter(Boolean),cached:true,cache_complete:cacheReady,batch_id:batchId,scan:{date:today,reason:"CACHED_PREDICTIONS",ranked_matches:uniqueCached.length}}}}const intakeSync=await syncExternalData(false);const s=await getSettings();const syncResult:any=intakeSync;const ms=await getMatches(),history=await getHistoricalMatches(),st=await getStats(),{data:state}=await sb.from("football_ai_model_weights").select("*").eq("model_name","trademindmz-v3").maybeSingle();const eligibleRaw=ms.filter((m:any)=>{const kickoff=new Date(m.kickoff_at);return kickoff>=start&&kickoff<end&&!VOID.has(String(m.status||"").toLowerCase())});const seenFixtures=new Set<string>();const eligible=eligibleRaw.filter((m:any)=>{const key=[norm(m.home_team),norm(m.away_team),m.kickoff_at?String(m.kickoff_at).slice(0,10):String(m.league||"")].join("|");if(seenFixtures.has(key))return false;seenFixtures.add(key);return true});const syncError=syncResult?.football?.error||syncResult?.odds?.error||null;const providerTodayMatches=Number(syncResult?.data_intake?.today_matches??syncResult?.database?.today_matches??syncResult?.today_matches??0);const scanReason=syncError?"SYNC_ERROR":eligible.length?"READY":providerTodayMatches===0&&!syncResult?.football?.skipped?"NO_PROVIDER_DATA":"NO_MATCHES_TODAY";const scan={date:today,start:start.toISOString(),end:end.toISOString(),db_today_matches:ms.length,eligible_matches:eligible.length,provider_sync:syncResult,reason:scanReason,error:syncError};if(!eligible.length)return{matches_scanned:0,top6:[],cached:false,batch_id:batchId,scan};const baseRanked=await Promise.all(eligible.map(async (m:any)=>{const advanced_strength={home:advancedTeamStrength(m.home_team,st,history),away:advancedTeamStrength(m.away_team,st,history)};const home_away={home:homeAwayIntelligence(m.home_team,"HOME",st,history),away:homeAwayIntelligence(m.away_team,"AWAY",st,history)};const game_state=gameStateModel(m,st,home_away);const momentum={home:advancedMomentum(m.home_team,st,history),away:advancedMomentum(m.away_team,st,history)};const league_competition=await leagueCompetitionIntelligence(m,st);return {...m,model:{...preScore(m,st,state?.weights,advanced_strength,home_away,game_state,momentum,null,null,league_competition),advanced_strength,home_away,game_state,momentum,league_competition}};}));const ranked=baseRanked.sort((a,b)=>b.model.score-a.model.score).slice(0,6);let xgContext:any=null;try{const xg=await xgMonitor(today);if(xg?.status==="OK")xgContext=xg}catch{}const xgByTeam=new Map<string,any>();for(const tm of xgContext?.teams||[])xgByTeam.set(norm(tm.team_name),tm);const calibration=await confidenceCalibration();const result=[];for(const m of ranked){const lineup=await lineupIntelligence(m);const tactical=tacticalIntelligence(m,lineup);const manager=await managerTacticalMatchup(m,lineup,tactical);const referee=await refereeEnvironmentIntelligence(m);const leagueCompetition=m.model.league_competition||await leagueCompetitionIntelligence(m,st);m.model={...m.model,lineup,tactical,manager,referee,league_competition:leagueCompetition};const tacticalEdge=Number(tactical?.formation_edge||0)+Number(tactical?.readiness_edge||0);const managerEdge=Number(manager?.tactical_matchup_edge||0);const refereeEdge=Number(referee?.environment_edge||0);m.model={...m.model,...preScore(m,st,state?.weights,m.model.advanced_strength,m.model.home_away,m.model.game_state,m.model.momentum,lineup,manager,leagueCompetition,referee)};m.model.tactical_edge=Number(tacticalEdge.toFixed(3));m.model.manager_tactical_edge=Number(managerEdge.toFixed(3));m.model.referee_environment_edge=Number(refereeEdge.toFixed(3));m.model.engineScore=Math.max(0,Math.min(100,Number(m.model.engineScore||0)+Math.abs(tacticalEdge)*12));m.model.score=m.model.engineScore;const {data:od}=s.odds_api_enabled?await sb.from("football_odds").select("market,selection,odds,bookmaker,captured_at").eq("match_id",m.id).in("market",["h2h","double_chance","btts","ou_2_5"]).order("captured_at",{ascending:false}).limit(100):{data:[]};const ai=await deep(m,s,od||[]);
const hm=xgByTeam.get(norm(m.home_team)),am=xgByTeam.get(norm(m.away_team));const xgHome=hm?.xg_for??null,xgAway=am?.xg_for??null;const xgProb=xg1x2Prob(xgHome,xgAway);const marketConsensus=marketConsensus1x2(od||[]);const ensemble=ensembleProbabilities(m.model,ai,marketConsensus,xgProb);const calibrated=calibratedConfidence(ensemble.confidence,calibration);ensemble.confidence=calibrated.confidence;const ensembleProb={home:ensemble.probabilities[0],draw:ensemble.probabilities[1],away:ensemble.probabilities[2]};
const marketRows=(od||[]).filter((x:any)=>String(x.selection||"").toUpperCase()===String(ensemble.prediction||m.model.selected).toUpperCase()&&Number(x.odds)>1);const market=marketRows.length?marketRows.reduce((a:any,b:any)=>Number(b.odds)>Number(a.odds)?b:a):null;const marketOdds=market?Number(market.odds):null;const implied=marketOdds?1/marketOdds:null;const selectedProbability=ensemble.prediction==="1"?ensembleProb.home:ensemble.prediction==="X"?ensembleProb.draw:ensembleProb.away;const edge=implied!=null&&Number.isFinite(selectedProbability)?Number(((selectedProbability-implied)*100).toFixed(1)):null;const ev=marketOdds!=null&&Number.isFinite(selectedProbability)?Number(((selectedProbability*marketOdds-1)*100).toFixed(1)):null;const valueSignal=edge==null?"NO MARKET":edge>=8&&ev>=5?"VALUE":edge>=3&&ev>=1?"LEAN":"NO BET";const noBet=valueSignal==="NO BET";const xgAvailable=Number.isFinite(Number(xgHome))&&Number.isFinite(Number(xgAway));const modelMarkets=marketProbabilities(ai.probabilities?.home,ai.probabilities?.draw,ai.probabilities?.away,xgHome,xgAway);
const marketDefinitions=[
  ["1X2",ensemble.prediction==="1"?"1":ensemble.prediction==="X"?"X":"2","h2h",selectedProbability],
  ["DOUBLE_CHANCE","1X","double_chance",modelMarkets["1X"]],
  ["DOUBLE_CHANCE","X2","double_chance",modelMarkets["X2"]],
  ["DOUBLE_CHANCE","12","double_chance",modelMarkets["12"]],
  ["BTTS","YES","btts",modelMarkets["BTTS_YES"]],
  ["BTTS","NO","btts",modelMarkets["BTTS_NO"]],
  ["OVER_UNDER","OVER 2.5","ou_2_5",modelMarkets["OVER_2_5"]],
  ["OVER_UNDER","UNDER 2.5","ou_2_5",modelMarkets["UNDER_2_5"]]
];
const marketAnalysis=marketDefinitions.map(([type,selection,market,prob]:any)=>{
  const candidates=(od||[]).filter((x:any)=>x.market===market&&String(x.selection).toUpperCase()===String(selection).toUpperCase()&&Number(x.odds)>1);
  const best=candidates.length?candidates.reduce((a:any,b:any)=>Number(b.odds)>Number(a.odds)?b:a):null;
  const mv=marketEdge(prob,best?.odds,od||[],market,String(selection));
  return{type,selection,probability:prob==null?null:Number(Number(prob).toFixed(4)),market_odds:best?Number(best.odds):null,best_bookmaker:best?.bookmaker||null,...mv,no_bet:mv.signal==="NO BET",available:Boolean(best)};
});
const actionableMarkets=marketAnalysis.filter((x:any)=>x.available&&x.signal!=="NO MARKET");
const primaryMarket=marketAnalysis.find((x:any)=>x.type==="1X2")||null;
const primaryEdge=primaryMarket?.edge??edge;
const primaryEv=primaryMarket?.ev??ev;
const primaryFairProbability=primaryMarket?.fair_probability??implied;
const primaryOverround=primaryMarket?.overround_percent??null;
const primarySignal=primaryMarket?.signal??valueSignal;
const primaryNoBet=primarySignal==="NO BET";
const aiConfidence=Math.max(0,Math.min(100,Number(ai.confidence||0)));
const primaryGate=smartDecision(
  primaryMarket?.probability??null,
  ensemble.confidence,
  primaryEdge,
  primaryEv,
  primaryOverround,
  primaryMarket?.bookmakers_count??0,
  primaryMarket?.agreement_spread??null,
  primarySignal
);
const smartSignal=primaryGate.decision;
const smartNoBet=smartSignal==="NO BET";
const {data:existing}=await sb.from("football_ai_predictions").select("id,reasoning").eq("match_id",m.id).eq("status","OPEN").limit(1).maybeSingle();const engineScore=Math.round(Number(m.model.engineScore||0));const valueComponent=primaryEdge==null?50:Math.max(0,Math.min(100,50+Number(primaryEdge)*2));const xgComponent=xgAvailable?Math.max(0,Math.min(100,50+(Number(xgHome)-Number(xgAway))*15)):50;const ensembleScore=Math.round(Math.max(0,Math.min(100,ensemble.confidence)));
const finalScore=Math.round(Math.max(0,Math.min(100,engineScore*.35+ensembleScore*.40+valueComponent*.15+xgComponent*.10)));const pred={match_id:m.id,prediction:ensemble.prediction||ai.prediction||m.model.selected,selected_outcome:ensemble.prediction||ai.prediction||m.model.selected,confidence:ensemble.confidence,implied_probability:Number(ensembleProb.home||0),odds:od?.[0]?.odds||null,value_percent:ai.value_percent,model_score:finalScore,reasoning:{reasoning:ai.reasoning,engine_score:engineScore,engine_prediction:m.model.selected,engine_confidence:Math.round(m.model.confidence*100),ensemble_prediction:ensemble.prediction,ensemble_raw_confidence:Math.round(Math.max(...ensemble.probabilities)*100),ensemble_confidence:ensemble.confidence,confidence_adjustment:calibrated.adjustment,confidence_calibration_status:calibration.status,ensemble_probabilities:{home:ensembleProb.home,draw:ensembleProb.draw,away:ensembleProb.away},ensemble_components:ensemble.components,markets:marketAnalysis,actionable_markets:actionableMarkets,final_score:finalScore,market_odds:marketOdds,best_bookmaker:market?.bookmaker||null,implied_probability:implied,fair_probability:primaryFairProbability,overround_percent:primaryOverround,edge_percent:primaryEdge,expected_value_percent:primaryEv,value_signal:smartSignal,no_bet:smartNoBet,smart_decision:smartSignal,quality_score:primaryGate.quality_score,decision_reasons:primaryGate.reasons,market_agreement:primaryGate.market_agreement,bookmaker_consensus:primaryGate.bookmaker_consensus,xg_home:xgHome,xg_away:xgAway,xg_available:xgAvailable,batch_id:(existing?.reasoning?.batch_id||batchId),batch_created_at:(existing?.reasoning?.batch_created_at||new Date().toISOString())},provider:ai.provider,model:ai.model,status:"OPEN",feature_vector:{...m.model.features,manager:m.model.manager,referee:m.model.referee,referee_environment_edge:m.model.referee_environment_edge??null,home_away:m.model.home_away,home_away_edge:m.model.home_away_edge??null,game_state:m.model.game_state,game_state_edge:m.model.game_state_edge??null,momentum:m.model.momentum,momentum_edge:m.model.momentum_edge??null,lineup:m.model.lineup,lineup_edge:m.model.lineup_edge??null,tactical:m.model.tactical,tactical_edge:m.model.tactical_edge??null,league_competition:m.model.league_competition,competition_edge:m.model.competition_edge??m.model.league_competition?.competition_edge??null,xg_home:xgHome,xg_away:xgAway,edge_percent:primaryEdge,expected_value_percent:primaryEv,market_fair_probability:primaryFairProbability,market_overround_percent:primaryOverround,smart_decision:smartSignal,decision_quality:primaryGate.quality_score},feature_version:"v7.0-production-hardening",model_version:state?.model_version||"v4.0"};let saved:any=null;if(existing?.id){const {data:u}=await sb.from("football_ai_predictions").update(pred).eq("id",existing.id).select().single();saved=u}else{const {data:i}=await sb.from("football_ai_predictions").insert(pred).select().single();saved=i}if(saved)result.push({...m,ai,prediction:saved});}return{matches_scanned:ms.length,top6:result,cached:false,batch_id:batchId,scan:{...scan,ranked_matches:ranked.length,value_engine:"ACTIVE",xg_engine:xgContext?"ACTIVE":"WAITING"}}}async function valueMonitor(refresh=false){
  const {date:today,start,end}=todayBounds();
  const {data:ps}=await sb.from("football_ai_predictions").select("id,match_id,prediction,confidence,odds,value_percent,reasoning,provider,model,status,created_at").eq("reasoning->>batch_id","day-"+today).order("created_at",{ascending:false}).limit(20);
  if(!ps?.length&&refresh){
    const task=(async()=>{try{await top6(false)}catch(e){console.error("Value Engine background scan failed",e)}})();
    const runtime=(globalThis as any).EdgeRuntime;
    if(runtime?.waitUntil)runtime.waitUntil(task);
    else console.warn("EdgeRuntime.waitUntil unavailable for Value Engine scan");
    return {date:today,status:"SCANNING",matches_scanned:0,value_bets:0,leans:0,no_bets:0,no_market:0,best_edge:null,average_edge:null,average_ev:null,rows:[]};
  }
  const ids=(ps||[]).map((x:any)=>x.match_id).filter(Boolean);
  const {data:ms}=ids.length?await sb.from("football_matches").select("id,home_team,away_team,league,kickoff_at,status").in("id",ids):{data:[]};
  const matches=new Map((ms||[]).map((m:any)=>[m.id,m]));
  const rawRows=(ps||[]).map((p:any)=>{
    const r=p.reasoning||{},m=matches.get(p.match_id);
    return {id:p.id,match_id:p.match_id,home_team:m?.home_team||"—",away_team:m?.away_team||"—",league:m?.league||"—",kickoff_at:m?.kickoff_at||null,prediction:p.prediction,confidence:Number(p.confidence||0),market_odds:r.market_odds??p.odds??null,best_bookmaker:r.best_bookmaker||null,implied_probability:r.implied_probability??null,fair_probability:r.fair_probability??null,overround_percent:r.overround_percent??null,edge_percent:r.edge_percent??null,expected_value_percent:r.expected_value_percent??null,value_signal:r.value_signal||"NO MARKET",smart_decision:r.smart_decision||r.value_signal||"NO MARKET",no_bet:Boolean(r.no_bet),quality_score:r.quality_score??null,decision_reasons:Array.isArray(r.decision_reasons)?r.decision_reasons:[],market_agreement:r.market_agreement||null,bookmaker_consensus:r.bookmaker_consensus||null,ensemble_prediction:r.ensemble_prediction||null,ensemble_confidence:r.ensemble_confidence??null,ensemble_components:Array.isArray(r.ensemble_components)?r.ensemble_components:[],markets:Array.isArray(r.markets)?r.markets:[],xg_home:r.xg_home??null,xg_away:r.xg_away??null,xg_available:Boolean(r.xg_available),engine_score:r.engine_score??null,final_score:r.final_score??p.model_score??null,status:p.status||"OPEN",created_at:p.created_at};
  }).filter((x:any)=>x.home_team!=="—"&&x.away_team!=="—");
  // A fixture can be stored twice with slightly different kickoff timestamps. Keep the most complete
  // analysis for that fixture/date; individual market selections remain grouped in its markets array.
  const fixtureKey=(x:any)=>[norm(x.home_team),norm(x.away_team),x.kickoff_at?String(x.kickoff_at).slice(0,10):today].join("|");
  const completeness=(x:any)=>(x.market_odds!=null?8:0)+(x.edge_percent!=null?4:0)+(x.expected_value_percent!=null?4:0)+(x.best_bookmaker?2:0)+(x.markets||[]).filter((m:any)=>m.available).length+(Number(x.quality_score)||0)/100;
  const unique=new Map<string,any>();
  for(const row of rawRows){const key=fixtureKey(row),old=unique.get(key);if(!old||completeness(row)>completeness(old))unique.set(key,row)}
  const rows=Array.from(unique.values()).sort((a:any,b:any)=>String(a.kickoff_at||"").localeCompare(String(b.kickoff_at||""))).map(({created_at,...row}:any)=>row);
  const nums=(key:string)=>rows.map((x:any)=>Number(x[key])).filter(Number.isFinite);
  const edges=nums("edge_percent"),evs=nums("expected_value_percent"),margins=nums("overround_percent");
  return {date:today,status:"OK",matches_scanned:rows.length,value_bets:rows.filter((x:any)=>x.value_signal==="VALUE").length,leans:rows.filter((x:any)=>x.value_signal==="LEAN").length,no_bets:rows.filter((x:any)=>x.value_signal==="NO BET").length,no_market:rows.filter((x:any)=>x.value_signal==="NO MARKET").length,best_edge:edges.length?Math.max(...edges):null,average_edge:edges.length?Number((edges.reduce((a:number,b:number)=>a+b,0)/edges.length).toFixed(1)):null,average_ev:evs.length?Number((evs.reduce((a:number,b:number)=>a+b,0)/evs.length).toFixed(1)):null,average_overround:margins.length?Number((margins.reduce((a:number,b:number)=>a+b,0)/margins.length).toFixed(1)):null,rows};
}
async function evaluate(){
  const {data:ps,error:predictionError}=await sb.from("football_ai_predictions").select("id,match_id,prediction,odds,reasoning").eq("status","OPEN").limit(500);
  if(predictionError)throw predictionError;
  if(!ps?.length)return{evaluated:0};
  const linkedIds=ps.map((p:any)=>p.match_id).filter(Boolean);
  const fromDate=(()=>{const {date}=todayBounds();const [y,m,d]=date.split("-").map(Number);return osloDate(new Date(Date.UTC(y,m-1,d-30,12,0,0)))})();
  const toDate=(()=>{const {date}=todayBounds();const [y,m,d]=date.split("-").map(Number);return osloDate(new Date(Date.UTC(y,m-1,d+2,12,0,0)))})();
  const {data:allMatches,error:matchError}=await sb.from("football_matches").select("id,home_team,away_team,league,kickoff_at,status,home_score,away_score").gte("kickoff_at",osloMidnight(fromDate).toISOString()).lt("kickoff_at",osloMidnight(toDate).toISOString()).limit(2000);
  if(matchError)throw matchError;
  const matches=allMatches||[];
  const {data:linkedMatches}=linkedIds.length?await sb.from("football_matches").select("id,home_team,away_team,league,kickoff_at,status,home_score,away_score").in("id",linkedIds):{data:[]};
  const byId=new Map((linkedMatches||[]).map((m:any)=>[m.id,m]));
  const isFinished=(value:any)=>{const raw=String(value||"").trim().toUpperCase();const s=raw.replace(/[^A-Z0-9]+/g," ").trim();if(VOID.has(raw.toLowerCase()))return false;return new Set(["FT","AET","PEN","FINISHED","ENDED","FULL TIME","AFTER EXTRA TIME","AFTER PENALTIES","MATCH FINISHED","FT PEN","FINISHED AET","FINISHED PENALTIES","AFTER EXTRA TIME FINISHED","FINISHED AFTER EXTRA TIME","FINISHED AFTER PENALTIES"]).has(s)||s.endsWith(" FINISHED")||s.startsWith("FINISHED ")};
  const key=(m:any)=>[norm(m?.home_team),norm(m?.away_team),m?.kickoff_at?osloDate(new Date(m.kickoff_at)):""].join("|");
  const finals=new Map<string,any>();
  const finalRows=matches.filter((m:any)=>isFinished(m.status)&&m.home_score!=null&&m.away_score!=null);
  for(const m of finalRows){const k=key(m),prev=finals.get(k);if(!prev||new Date(m.kickoff_at).getTime()>new Date(prev.kickoff_at).getTime())finals.set(k,m)}
  let n=0,reconciledDuplicates=0;
  for(const p of ps){
    let m=byId.get(p.match_id) as any;
    if(!m)continue;
    if(!isFinished(m.status)||m.home_score==null||m.away_score==null){
      let sibling=finals.get(key(m));
      if(!sibling){const targetTime=new Date(m.kickoff_at).getTime();const home=norm(m.home_team),away=norm(m.away_team);sibling=finalRows.filter((candidate:any)=>norm(candidate.home_team)===home&&norm(candidate.away_team)===away&&Math.abs(new Date(candidate.kickoff_at).getTime()-targetTime)<=36*60*60*1000).sort((a:any,b:any)=>Math.abs(new Date(a.kickoff_at).getTime()-targetTime)-Math.abs(new Date(b.kickoff_at).getTime()-targetTime))[0]}
      if(sibling){m=sibling;reconciledDuplicates++}
      else continue;
    }
    const result=Number(m.home_score)>Number(m.away_score)?"1":Number(m.home_score)<Number(m.away_score)?"2":"X";
    const correct=String(p.prediction).trim().toUpperCase()===result;
    const rawOdds=p.reasoning?.market_odds??p.odds;
    const marketOdds=rawOdds==null?NaN:Number(rawOdds);
    const pnl=Number.isFinite(marketOdds)&&marketOdds>1?(correct?marketOdds-1:-1):null;
    const evaluatedAt=new Date().toISOString();
    const {data:claimed,error:claimError}=await sb.from("football_ai_predictions").update({status:correct?"WON":"LOST",settled_result:result,pnl,evaluated_at:evaluatedAt}).eq("id",p.id).eq("status","OPEN").select("id").maybeSingle();
    if(claimError){console.error("Prediction settlement update failed",p.id,claimError.message);continue}
    if(!claimed?.id)continue;
    const {error:evaluationError}=await sb.from("football_ai_evaluations").upsert({prediction_id:p.id,match_id:m.id,actual_result:result,predicted_result:p.prediction,correct,stake:1,pnl,evaluated_at:evaluatedAt},{onConflict:"prediction_id"});
    if(evaluationError){console.error("Prediction evaluation write failed; reopening prediction",p.id,evaluationError.message);await sb.from("football_ai_predictions").update({status:"OPEN",settled_result:null,pnl:null,evaluated_at:null}).eq("id",p.id).eq("status",correct?"WON":"LOST");continue}
    n++;
  }
  let learningResult:any=null,learningError=null;
  if(n>0){try{learningResult=await learning()}catch(e){learningError=e instanceof Error?e.message:String(e)}}
  return{evaluated:n,reconciled_duplicate_fixtures:reconciledDuplicates,learning:learningResult,learning_error:learningError}
}
async function liveLearning(){
  const {data:rows,error}=await sb.from("football_live_signals").select("prediction,decision,signal_score,confidence,edge_percent,expected_value_percent,status,actual_result,pnl,created_at,reasoning").order("created_at",{ascending:false}).limit(1000);
  if(error)return{status:"WAITING_FOR_LIVE_DATA",samples:0,error:error.message};
  const all=rows||[], settled=all.filter((x:any)=>x.status==="WON"||x.status==="LOST"||x.actual_result);
  const calc=(xs:any[])=>{const n=xs.length,w=xs.filter((x:any)=>x.status==="WON"||String(x.actual_result)===String(x.prediction)).length,pnl=xs.reduce((a:any,x:any)=>a+Number(x.pnl||0),0);return{samples:n,wins:w,losses:n-w,accuracy:n?Math.round(w/n*100):null,roi:n?Math.round(pnl/n*1000)/10:0,pnl:Math.round(pnl*100)/100}};
  const byDecision={BET:calc(settled.filter((x:any)=>x.decision==="BET")),LEAN:calc(settled.filter((x:any)=>x.decision==="LEAN"))};
  const avg=(k:string)=>{const v=settled.map((x:any)=>Number(x[k])).filter(Number.isFinite);return v.length?Math.round(v.reduce((a:number,b:number)=>a+b,0)/v.length*10)/10:null};
  const scoreBins=Array.from({length:5},(_,i)=>{const lo=i*20,hi=lo+19;return{range:lo+"-"+hi,samples:settled.filter((x:any)=>Number(x.signal_score)>=lo&&Number(x.signal_score)<=hi).length,accuracy:calc(settled.filter((x:any)=>Number(x.signal_score)>=lo&&Number(x.signal_score)<=hi)).accuracy}});
  const status=settled.length>=100?"LEARNING":settled.length>=30?"CALIBRATING":"COLLECTING";
  return{status,samples:all.length,settled:settled.length,accuracy:calc(settled).accuracy,roi:calc(settled).roi,pnl:calc(settled).pnl,avg_edge:avg("edge_percent"),avg_ev:avg("expected_value_percent"),by_decision:byDecision,score_bins:scoreBins};
}
async function learning(){const {data:e}=await sb.from("football_ai_evaluations").select("prediction_id,correct,pnl,actual_result").order("evaluated_at",{ascending:false}).limit(1000);const rows=e||[];const ids=rows.map((x:any)=>x.prediction_id).filter(Boolean);const {data:ps}=ids.length?await sb.from("football_ai_predictions").select("id,prediction,reasoning").in("id",ids):{data:[]};const byId=new Map((ps||[]).map((x:any)=>[x.id,x]));const correct=rows.filter((x:any)=>x.correct).length,accuracy=rows.length?correct/rows.length:null,roi=rows.length?rows.reduce((a:any,x:any)=>a+Number(x.pnl||0),0)/rows.length:0;const engineRows=rows.map((x:any)=>({eval:x,p:byId.get(x.prediction_id)})).filter((x:any)=>x.p?.reasoning?.engine_prediction);const engineCorrect=engineRows.filter((x:any)=>String(x.p.reasoning.engine_prediction)===String(x.eval.actual_result)).length;const engineAccuracy=engineRows.length?engineCorrect/engineRows.length:null;const {data:old}=await sb.from("football_ai_model_weights").select("*").eq("model_name","trademindmz-v3").maybeSingle();const weights={...(old?.weights||{home:1,draw:.1,away:-1})};const lr=Number(old?.learning_rate||.02);if(accuracy!=null){weights.home+=lr*(accuracy-.5);weights.away-=lr*(accuracy-.5)}if(engineAccuracy!=null){weights.home+=lr*.5*(engineAccuracy-.5);weights.away-=lr*.5*(engineAccuracy-.5)}await sb.from("football_ai_model_weights").upsert({model_name:"trademindmz-v3",model_version:"v4."+rows.length,weights,bias:old?.bias||{home:0,draw:0,away:0},learning_rate:lr,training_samples:rows.length,accuracy,roi,updated_at:new Date().toISOString()});return{samples:rows.length,accuracy,roi,engine_samples:engineRows.length,engine_accuracy:engineAccuracy}}
Deno.serve(async req=>{const requestId=crypto.randomUUID();if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"authorization,apikey,content-type,x-client-info,x-supabase-api-version","access-control-allow-methods":"POST,OPTIONS","access-control-max-age":"86400","x-request-id":requestId}});if(req.method!=="POST")return out(405,{error:"method_not_allowed",request_id:requestId},requestId);if(!SUPABASE_URL||!SUPABASE_KEY)return out(503,{error:"supabase_environment_not_configured",message:"Supabase URL or service key is missing in the Edge Function environment.",request_id:requestId},requestId);try{const b=await req.json().catch(()=>null);if(!b||typeof b!=="object"||Array.isArray(b))return out(400,{error:"invalid_json_body",request_id:requestId},requestId);const a=String(b.action||"top6");const allowed=new Set(["settings","connectivity","diagnostics","data_intake","xg_monitor","live_engine","live_learning","value_monitor","sync","update_settings","top6","pipeline","evaluate","results","performance","learning"]);if(!allowed.has(a))return out(400,{error:"unknown_action",request_id:requestId},requestId);if(a==="settings")return out(200,await getSettings());if(a==="connectivity")return out(200,await connectivity());if(a==="diagnostics")return out(200,await diagnostics());if(a==="data_intake")return out(200,await dataIntakeAudit());if(a==="xg_monitor")return out(200,await xgMonitor(String(b.target_date||"")));if(a==="live_engine"){const result=await liveMatchEngine();return out(200,{...result,learning:await liveLearning()});}if(a==="live_learning")return out(200,await liveLearning());if(a==="value_monitor")return out(200,await valueMonitor(Boolean(b.refresh)));if(a==="sync"){const football=await syncFootball();let evaluation:any=null;let evaluation_error:string|null=null;if(football?.configured&&!football?.error){try{evaluation=await evaluate()}catch(e){evaluation_error=e instanceof Error?e.message:String(e)}}return out(200,{football,evaluation,evaluation_error,note:"Sync action runs football fixtures/results only; odds sync is kept separate to avoid Edge Function CPU timeouts."});}if(a==="update_settings"){const current=await getSettings();const next={...current,...(b.settings||{}),updated_at:new Date().toISOString()};const {data,error}=await sb.from("football_ai_settings").upsert({...next,id:true}).select().single();if(error)throw error;return out(200,data||next);}if(a==="top6"||a==="pipeline")return out(200,await top6(Boolean(b.force)));if(a==="evaluate")return out(200,await evaluate());if(a==="results"){const {date:today}=todayBounds();const historyStart=new Date(Date.now()-7*24*60*60*1000).toISOString();const {data:allPs,error:predError}=await sb.from("football_ai_predictions").select("id,match_id,prediction,selected_outcome,confidence,odds,value_percent,provider,model,status,settled_result,pnl,evaluated_at,created_at,reasoning").gte("created_at",historyStart).order("created_at",{ascending:false}).limit(500);if(predError)throw predError;const ps=allPs||[];const batchPs=ps.slice(0,42);const ids=batchPs.map((x:any)=>x.match_id).filter(Boolean);let ms:any[]=[];if(ids.length){const {data,error}=await sb.from("football_matches").select("id,home_team,away_team,league,kickoff_at,home_score,away_score,status").in("id",ids);if(error)throw error;ms=data||[]}const matches=new Map(ms.map((m:any)=>[m.id,m]));const rawRows=batchPs.map((p:any)=>({...p,match:matches.get(p.match_id)||null})).filter((x:any)=>x.match);
const isFinal=(m:any)=>{const raw=String(m?.status||"").trim().toUpperCase();const s=raw.replace(/[^A-Z0-9]+/g," ").trim();return new Set(["FT","AET","PEN","FINISHED","ENDED","FULL TIME","AFTER EXTRA TIME","AFTER PENALTIES","MATCH FINISHED","FT PEN","FINISHED AET","FINISHED PENALTIES","AFTER EXTRA TIME FINISHED","FINISHED AFTER EXTRA TIME","FINISHED AFTER PENALTIES"]).has(s)||s.endsWith(" FINISHED")||s.startsWith("FINISHED ")};
const fixtureKey=(x:any)=>[norm(x.match?.home_team),norm(x.match?.away_team),x.match?.kickoff_at?String(x.match.kickoff_at).slice(0,10):today].join("|");
const completeness=(x:any)=>(isFinal(x.match)?100:0)+(x.match?.home_score!=null&&x.match?.away_score!=null?20:0)+(x.reasoning?.market_odds!=null||x.odds!=null?5:0)+(x.reasoning?.market_id?2:0)+(x.created_at?1:0);
const uniqueRows=new Map<string,any>();
for(const row of rawRows){const key=fixtureKey(row),old=uniqueRows.get(key);if(!old||completeness(row)>completeness(old))uniqueRows.set(key,row)}
const rows=Array.from(uniqueRows.values()).sort((a:any,b:any)=>String(a.match?.kickoff_at||"").localeCompare(String(b.match?.kickoff_at||"")));
const runtime=(globalThis as any).EdgeRuntime;const staleOpen=rawRows.some((x:any)=>x.status==="OPEN"&&x.match?.kickoff_at&&new Date(x.match.kickoff_at).getTime()<Date.now()-3*60*60*1000);const task=(async()=>{try{if(staleOpen&&Date.now()-lastResultsFinalSync>5*60*1000){const sync=await syncFootball();lastResultsFinalSync=Date.now();console.log("Results stale-pick final refresh",JSON.stringify({provider:sync?.provider,synced:sync?.synced,total:sync?.total,error:sync?.error}))}else{const sync=await syncExternalData(false);console.log("Results throttled fixture refresh",JSON.stringify({football:sync?.football,odds:sync?.odds}))}const evaluation=await evaluate();console.log("Results evaluation",JSON.stringify(evaluation));await top6(false)}catch(e){console.error("Results background refresh failed",e)}})();if(runtime?.waitUntil)runtime.waitUntil(task);else console.warn("EdgeRuntime.waitUntil unavailable for Results background refresh");const settled=rows.filter((x:any)=>x.status==="WON"||x.status==="LOST");const wins=settled.filter((x:any)=>x.status==="WON").length;const pnl=settled.reduce((a:any,x:any)=>a+Number(x.pnl||0),0);return out(200,{status:rows.length?"READY":"SCANNING",results:rows,summary:{batch_date:today,batch_size:rows.length,history_days:7,evaluated:settled.length,wins,losses:settled.filter((x:any)=>x.status==="LOST").length,pending:rows.filter((x:any)=>x.status==="OPEN").length,accuracy:settled.length?Math.round(wins/settled.length*100):null,roi:settled.length?Math.round(pnl/settled.length*1000)/10:0}})}
if(a==="performance"){const {data:e}=await sb.from("football_ai_evaluations").select("prediction_id,correct,pnl,evaluated_at,actual_result").order("evaluated_at",{ascending:false}).limit(1000);const rows=e||[];const ids=rows.map((x:any)=>x.prediction_id).filter(Boolean);const {data:ps}=ids.length?await sb.from("football_ai_predictions").select("id,reasoning,prediction,confidence,status,odds,created_at").in("id",ids):{data:[]};const byId=new Map((ps||[]).map((x:any)=>[x.id,x]));const enriched=rows.map((x:any)=>({e:x,p:byId.get(x.prediction_id)}));const engineRows=enriched.filter((x:any)=>x.p?.reasoning?.engine_prediction);const engineCorrect=engineRows.filter((x:any)=>String(x.p.reasoning.engine_prediction)===String(x.e.actual_result)).length;const engineAccuracy=engineRows.length?Math.round(engineCorrect/engineRows.length*100):null;const engineScores=engineRows.map((x:any)=>Number(x.p.reasoning.engine_score)).filter((x:any)=>Number.isFinite(x));const engineAvg=engineScores.length?Math.round(engineScores.reduce((a:number,b:number)=>a+b,0)/engineScores.length):null;const calc=(xs:any[])=>{const n=xs.length,wins=xs.filter(x=>x.correct).length,pnl=xs.reduce((a,x)=>a+Number(x.pnl||0),0);return{samples:n,wins,losses:n-wins,accuracy:n?Math.round(wins/n*100):null,roi:n?Math.round(pnl/n*1000)/10:0,pnl:Math.round(pnl*100)/100}};const recent=calc(rows.slice(0,20)),previous=calc(rows.slice(20,40));const trend=recent.accuracy==null||previous.accuracy==null?"STABLE":recent.accuracy>previous.accuracy?"IMPROVING":recent.accuracy<previous.accuracy?"ADJUSTING":"STABLE";const valueRows=enriched.filter((x:any)=>x.p?.reasoning?.value_signal);const valueCalc=(signal:string)=>calc(valueRows.filter((x:any)=>String(x.p.reasoning.value_signal)===signal).map((x:any)=>x.e));const valueBreakdown={VALUE:valueCalc("VALUE"),LEAN:valueCalc("LEAN"),"NO BET":valueCalc("NO BET")};let cumulative=0,peak=0,maxDrawdown=0;for(const x of [...rows].reverse()){cumulative+=Number(x.pnl||0);peak=Math.max(peak,cumulative);maxDrawdown=Math.min(maxDrawdown,cumulative-peak)}const settledWithOdds=rows.filter((x:any)=>x.pnl!=null&&Number.isFinite(Number(x.pnl)));const avgEdge=valueRows.map((x:any)=>Number(x.p.reasoning.edge_percent)).filter((x:any)=>Number.isFinite(x));const avgEv=valueRows.map((x:any)=>Number(x.p.reasoning.expected_value_percent)).filter((x:any)=>Number.isFinite(x));const backtest={status:rows.length?"ACTIVE_DATASET":"WAITING_FOR_RESULTS",samples:rows.length,settled_with_odds:settledWithOdds.length,accuracy:calc(rows).accuracy,roi:calc(rows).roi,pnl:calc(rows).pnl,avg_edge:avgEdge.length?Math.round(avgEdge.reduce((a:number,b:number)=>a+b,0)/avgEdge.length*10)/10:null,avg_ev:avgEv.length?Math.round(avgEv.reduce((a:number,b:number)=>a+b,0)/avgEv.length*10)/10:null,max_drawdown:Math.round(maxDrawdown*100)/100,value_breakdown:valueBreakdown};const {data:w}=await sb.from("football_ai_model_weights").select("*").eq("model_name","trademindmz-v3").maybeSingle();const weights=w?.weights||{home:1,draw:.1,away:-1};const engineStatus=engineAccuracy==null?"COLLECTING":engineAccuracy>=65?"STRONG":engineAccuracy>=50?"LEARNING":"ADJUSTING";const calibration=await confidenceCalibration();return out(200,{model:{name:"TMZ-AI",version:w?.model_version||"v4.0",samples:w?.training_samples||rows.length,learning_rate:w?.learning_rate||.02,updated_at:w?.updated_at||null,trend,weights},engine:{name:"TradeMindMZ Engine",version:"v1.0",status:engineStatus,samples:engineRows.length,accuracy:engineAccuracy,average_score:engineAvg,learning_active:true,description:"Kvantitativ motor som scorer kampene før AI og justerer vekter fra fasit."},metrics:{...calc(rows),recent,previous},backtest,calibration,pipeline:["Data intake","Engine Score","Deep AI","Resultat","Error scan","Weight update","Validation"],signals:[{name:"ACCURACY",value:recent.accuracy||0,status:trend},{name:"ENGINE",value:engineAccuracy||0,status:engineStatus},{name:"VALUE",value:Math.max(0,Math.min(100,50+recent.roi*4)),status:recent.roi>=0?"POSITIVE":"NEGATIVE"},{name:"DATA QUALITY",value:Math.min(100,Math.round(rows.length/10)),status:rows.length>=100?"STRONG":rows.length>=30?"BUILDING":"COLLECTING"},{name:"LEARNING",value:Math.min(100,Math.round((w?.training_samples||rows.length)/5)),status:trend}]});}if(a==="learning")return out(200,await learning());return out(400,{error:"unknown_action"});}catch(e){console.error("football-ai request failed",e);return out(500,{error:"internal_error",request_id:requestId},requestId);}});