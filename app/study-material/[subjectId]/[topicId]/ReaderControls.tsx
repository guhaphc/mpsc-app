"use client";
import {useEffect,useState} from "react";

type Keyword={term:string;category:string;importance?:string};
type Block={type:"heading"|"subheading"|"paragraph"|"bullet"|"numbered"|"callout"|"table";text?:string;items?:string[];columns?:string[];rows?:string[][]};
type Sub={id:string;title:string;content:string;content_blocks?:Block[];important_keywords?:Keyword[];marathi_content?:string;marathi_content_blocks?:Block[];translation_status?:string};

function renderRichText(text:string|undefined, keywords:Keyword[]=[]){
 const value=String(text||"");
 const terms=[...new Set(keywords.map(k=>String(k.term||"").trim()).filter(Boolean))].sort((a,b)=>b.length-a.length);
 const escapeRegExp=(s:string)=>s.replace(/[.*+?^\${}()|[\]\\]/g,"\\$&");
 const pattern=terms.length?new RegExp("("+terms.map(escapeRegExp).join("|")+")","gi"):null;
 if(!pattern)return value;
 const parts=value.split(pattern);
 return parts.map((part,i)=>terms.some(t=>t.toLowerCase()===part.toLowerCase())?<strong key={i}>{part}</strong>:<span key={i}>{part}</span>);
}
function renderExplanation(text:string){
 const lines=String(text||"").split(/\\n+/).map(x=>x.trim()).filter(Boolean);
 const labels=["Meaning","Key point","MPSC relevance","Quick revision","महत्त्व","मुख्य मुद्दा","MPSC महत्त्व","जलद उजळणी"];
 return <div style={{display:"grid",gap:18}}>
  {lines.map((line,i)=>{
   const m=line.match(/^([^:]{2,32}):\\s*(.*)$/);
   const exact=labels.find(x=>x.toLowerCase()===line.toLowerCase());
   const label=exact||((m&&labels.some(x=>x.toLowerCase()===m[1].trim().toLowerCase()))?m![1].trim():"");
   const body=exact?"":label?m![2]:line;
   return label
    ? <section key={i} style={{padding:"14px 16px",border:"1px solid var(--line)",borderRadius:16,background:"rgba(20,70,120,.045)"}}>
        <h3 style={{margin:"0 0 8px",fontSize:17,fontWeight:950,lineHeight:1.3}}>{label}</h3>
        {body&&<div style={{lineHeight:1.78,fontSize:16}}>{body}</div>}
      </section>
    : <p key={i} style={{margin:0,lineHeight:1.78,fontSize:16}}>{body}</p>;
  })}
 </div>;
}

function escapeRegExp(s:string){return s.replace(/[.*+?^${}()|[\\]\\\\]/g,"\\\\function expandParagraphBlock(text:string):Block[]{");}\n\nfunction expandParagraphBlock(text:string):Block[]{
 const raw=String(text||"").replace(/\r/g,"").trim();
 if(!raw)return [];
 const knownHeadings=[
  "INTRODUCTION","BACKGROUND","DEFINITION","MEANING","KEY CONCEPT","KEY CONCEPTS",
  "ETHICAL INQUIRY","MPSC RELEVANCE","QUICK REVISION","EXAMPLE","EXAMPLES",
  "CASE STUDY","CONCLUSION","SUMMARY","IMPORTANT POINTS","KEY POINTS",
  "MPSC RELEVANCE","QUICK REVISION","महत्त्व","मुख्य मुद्दे","मुख्य मुद्दा","जलद उजळणी"
 ];
 const blocks:Block[]=[];
 const pushParagraph=(value:string)=>{const v=value.trim();if(v)blocks.push({type:"paragraph",text:v});};
 const pushBullets=(value:string)=>{
  const items=value.split(/\s*•\s*/).map(x=>x.trim()).filter(Boolean);
  if(items.length)blocks.push({type:"bullet",items});
 };
 const lines=raw.split(/\n+/).map(x=>x.trim()).filter(Boolean);
 let bulletBuffer:string[]=[];
 const flushBullets=()=>{if(bulletBuffer.length){blocks.push({type:"bullet",items:[...bulletBuffer]});bulletBuffer=[];}};
 for(const line of lines){
  if(/^[-•▪◦]\s*/.test(line)){
   bulletBuffer.push(line.replace(/^[-•▪◦]\s*/,"").trim());
   continue;
  }
  flushBullets();

  const exact=line.replace(/[:：]\s*$/,"").trim();
  if(knownHeadings.some(h=>h.toLowerCase()===exact.toLowerCase())){
   blocks.push({type:"heading",text:exact});
   continue;
  }

  const headingMatch=line.match(/^([A-Z][A-Z0-9 &'’\-]{2,40}|[A-Za-z][A-Za-z0-9 &'’\-]{2,40})\s*[:：]\s*(.+)$/);
  if(headingMatch && knownHeadings.some(h=>h.toLowerCase()===headingMatch[1].trim().toLowerCase())){
   blocks.push({type:"heading",text:headingMatch[1].trim()});
   const rest=headingMatch[2].trim();
   if(/(?:^|\s)•\s*/.test(rest))pushBullets(rest); else pushParagraph(rest);
   continue;
  }

  // Handle source text such as "INTRODUCTION Ethics, often..." where the heading
  // was accidentally merged into the first paragraph.
  const mergedHeading=knownHeadings.find(h=>line.toLowerCase().startsWith(h.toLowerCase()) && line.length>h.length && /^(?:\\s+|[:：])/.test(line.slice(h.length)));
  if(mergedHeading){
   const rest=line.slice(mergedHeading.length).replace(/^\\s+|^[:：]\\s*/,"").trim();
   blocks.push({type:"heading",text:mergedHeading});
   if(rest) {
    if(/(?:^|\s)•\s*/.test(rest))pushBullets(rest); else pushParagraph(rest);
   }
   continue;
  }

  // Convert inline bullet runs into a real list so bullets never sit inside a paragraph.
  if(/(?:^|\s)•\s*/.test(line)){
   const parts=line.split(/\s*•\s*/).map(x=>x.trim()).filter(Boolean);
   if(parts.length>1){
    const lead=parts.shift()||"";
    const colonLead=lead.match(/^(.{2,80})[:：]\s*$/);
    if(colonLead)blocks.push({type:"subheading",text:colonLead[1].trim()});
    else pushParagraph(lead);
    if(parts.length)blocks.push({type:"bullet",items:parts});
    continue;
   }
  }

  // A short label followed by a colon is treated as a subheading when it is
  // clearly a section label, rather than ordinary prose.
  const label=line.match(/^([^:：]{2,42})[:：]\s*(.+)$/);
  if(label && (knownHeadings.some(h=>h.toLowerCase()===label[1].trim().toLowerCase()) || label[1].trim().length<=28 && !/[.!?]$/.test(label[1].trim()))){
   blocks.push({type:"subheading",text:label[1].trim()});
   if(/(?:^|\s)•\s*/.test(label[2]))pushBullets(label[2]); else pushParagraph(label[2]);
   continue;
  }

  pushParagraph(line);
 }
 flushBullets();
 return blocks;
}

function normalizeBlocks(blocks:Block[]|undefined,fallback:string):Block[]{
 const source=Array.isArray(blocks)&&blocks.length?blocks:[{type:"paragraph",text:fallback} as Block];
 const out:Block[]=[];
 for(const block of source){
  if(block.type==="paragraph"){
   out.push(...expandParagraphBlock(block.text||""));
  }else if(block.type==="bullet"||block.type==="numbered"){
   const items=(block.items||[]).flatMap(item=>{
    const clean=String(item||"").trim();
    return clean.includes("•")?clean.split(/\s*•\s*/).map(x=>x.trim()).filter(Boolean):[clean];
   }).filter(Boolean);
   out.push({...block,items});
  }else{
   out.push(block);
  }
 }
 return out;
}

function renderBlocks(blocks:Block[]|undefined,fallback:string,keywords:Keyword[]=[]){
 const list=normalizeBlocks(blocks,fallback);
 return list.map((b,i)=>{
  const key="b-"+i;
  if(b.type==="heading")return <h2 key={key} style={{margin:"34px 0 12px",fontSize:"clamp(24px,5vw,31px)",lineHeight:1.25,fontWeight:850,letterSpacing:"-.02em"}}>{renderRichText(b.text,keywords)}</h2>;
  if(b.type==="subheading")return <h3 key={key} style={{margin:"27px 0 9px",fontSize:"clamp(19px,4vw,23px)",lineHeight:1.35,fontWeight:800}}>{renderRichText(b.text,keywords)}</h3>;
  if(b.type==="paragraph")return <p key={key} style={{margin:"0 0 17px",lineHeight:1.9,letterSpacing:".005em"}}>{renderRichText(b.text,keywords)}</p>;
  if(b.type==="bullet")return <ul key={key} style={{margin:"8px 0 22px",paddingLeft:25,listStylePosition:"outside"}}>{(b.items||[]).map((x,j)=><li key={j} style={{marginBottom:12,lineHeight:1.78,paddingLeft:5}}>{renderRichText(x,keywords)}</li>)}</ul>;
  if(b.type==="numbered")return <ol key={key} style={{margin:"8px 0 22px",paddingLeft:28}}>{(b.items||[]).map((x,j)=><li key={j} style={{marginBottom:12,lineHeight:1.78,paddingLeft:5}}>{renderRichText(x,keywords)}</li>)}</ol>;
  if(b.type==="callout")return <aside key={key} style={{margin:"22px 0",padding:"16px 18px",borderLeft:"4px solid var(--accent)",borderRadius:"0 14px 14px 0",background:"var(--soft)",fontWeight:650,lineHeight:1.75}}>{renderRichText(b.text,keywords)}</aside>;
  if(b.type==="table")return <div key={key} style={{overflowX:"auto",margin:"22px 0"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}><thead><tr>{(b.columns||[]).map((x,j)=><th key={j} style={{border:"1px solid var(--line)",padding:"10px",textAlign:"left",fontWeight:800}}>{renderRichText(x,keywords)}</th>)}</tr></thead><tbody>{(b.rows||[]).map((row,j)=><tr key={j}>{row.map((x,k)=><td key={k} style={{border:"1px solid var(--line)",padding:"10px",verticalAlign:"top",lineHeight:1.55}}>{renderRichText(x,keywords)}</td>)}</tr>)}</tbody></table></div>;
  return null;
 });
}

export default function ReaderControls({title,notes,contentBlocks,topicId,initialBookmarked,initialCompleted,subtopics}:{title:string;notes:string;contentBlocks?:Block[];topicId:string;initialBookmarked:boolean;initialCompleted:boolean;subtopics:Sub[]}) {
 const [marathi,setMarathi]=useState(false),[keyword,setKeyword]=useState<Keyword|null>(null),[explanation,setExplanation]=useState(""),[explaining,setExplaining]=useState(false),[showChapters,setShowChapters]=useState(false),[resume,setResume]=useState(0),[theme,setTheme]=useState<"light"|"paper"|"dark">("paper"),[fontScale,setFontScale]=useState(1),[bookmarked,setBookmarked]=useState(initialBookmarked),[bookmarking,setBookmarking]=useState(false),[completed,setCompleted]=useState(initialCompleted),[completing,setCompleting]=useState(false),[showSettings,setShowSettings]=useState(false),[progress,setProgress]=useState(0),[loading,setLoading]=useState(false),[keywordLoading,setKeywordLoading]=useState(false),[error,setError]=useState(""),[translated,setTranslated]=useState<any>(null),[readerSubtopics,setReaderSubtopics]=useState<Sub[]>(subtopics);

 useEffect(()=>{const saved=Number(localStorage.getItem("mpsc-progress-"+topicId)||0);setResume(saved);const onScroll=()=>{const max=document.documentElement.scrollHeight-window.innerHeight;const pct=max>0?Math.min(100,Math.round(window.scrollY/max*100)):0;setProgress(pct);localStorage.setItem("mpsc-progress-"+topicId,String(pct));};window.addEventListener("scroll",onScroll);onScroll();return()=>window.removeEventListener("scroll",onScroll)},[topicId]);
 useEffect(()=>{if(readerSubtopics.length&&readerSubtopics.some(s=>!Array.isArray(s.important_keywords)||!s.important_keywords.length)){setKeywordLoading(true);fetch("/api/student/generate-keywords",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topicId})}).then(async x=>{const d=await x.json();if(!x.ok)throw new Error(d.error||"Could not generate keywords.");if(Array.isArray(d.subtopics))setReaderSubtopics(prev=>prev.map((s,i)=>({...s,important_keywords:d.subtopics.find((x:any)=>x.id===s.id)?.important_keywords||s.important_keywords||[]})))}).catch(e=>setError(e?.message||"Could not generate keywords.")).finally(()=>setKeywordLoading(false))}},[topicId]);

 function continueReading(){window.scrollTo({top:Math.max(0,(document.documentElement.scrollHeight-window.innerHeight)*resume/100),behavior:"smooth"});}
 async function toggleBookmark(){if(bookmarking)return;const next=!bookmarked;setBookmarked(next);setBookmarking(true);try{const x=await fetch("/api/student/bookmark",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topicId,bookmarked:next})});const d=await x.json();if(!x.ok)throw new Error(d.error||"Could not update bookmark.");setBookmarked(!!d.bookmarked)}catch(e:any){setBookmarked(!next);setError(e?.message||"Could not update bookmark")}finally{setBookmarking(false)}}
 async function explainKeyword(k:Keyword){setKeyword(k);setExplanation("");setExplaining(true);try{const context=notes+"\n"+readerSubtopics.map(s=>s.title+"\n"+s.content).join("\n");const x=await fetch("/api/student/explain-keyword",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({keyword:k.term,context,language:marathi?"Marathi":"English"})});const d=await x.json();if(!x.ok)throw new Error(d.error||"Could not prepare the explanation.");setExplanation(d.explanation||"")}catch(e:any){setExplanation(e?.message||"Could not prepare the explanation")}finally{setExplaining(false)}}
 async function markCompleted(){if(completing)return;setCompleting(true);try{const x=await fetch("/api/student/study-progress",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topicId,completed:!completed})});const d=await x.json();if(!x.ok)throw new Error(d.error||"Could not update completion.");setCompleted(!!d.completed)}catch(e:any){setError(e?.message||"Could not update completion")}finally{setCompleting(false)}}
 async function translate(){if(translated){setMarathi(!marathi);return}setLoading(true);setError("");try{const x=await fetch("/api/student/translate-note",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topicId})});const d=await x.json();if(!x.ok)throw new Error(d.error||"Translation failed.");setTranslated(d.result);setMarathi(true)}catch(e:any){setError(e?.message||"Translation failed")}finally{setLoading(false)}}

 const data=marathi&&translated?translated:{title,notes,content_blocks:contentBlocks,subtopics:readerSubtopics}; const bg=theme==="paper"?"#f7f0df":theme==="dark"?"#171717":"var(--card)"; const fg=theme==="dark"?"#eeeeee":"inherit";
 const bodyStyle={fontSize:`calc(clamp(17px,2vw,19px) * ${fontScale})`,color:fg};
 return <div style={{color:fg}}>
  <div style={{position:"sticky",top:0,zIndex:5,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"10px 0",background:theme==="paper"?"rgba(247,240,223,.96)":theme==="dark"?"rgba(23,23,23,.96)":"var(--bg)",backdropFilter:"blur(10px)",borderBottom:"1px solid var(--line)"}}>
   <div style={{fontSize:12,fontWeight:850}}>READING · {progress}%</div><div style={{display:"flex",gap:6}}><button className="btn secondary" onClick={()=>setShowSettings(!showSettings)}>Aa</button><button className="btn secondary" onClick={()=>setShowChapters(!showChapters)}>☰</button><button className="btn secondary" onClick={toggleBookmark} disabled={bookmarking}>{bookmarking?"⏳":bookmarked?"🔖 Saved":"🔖"}</button></div>
  </div>
  {resume>5&&<button className="btn secondary" onClick={continueReading} style={{marginTop:8}}>▶ Continue Reading · {resume}%</button>}
  {showChapters&&<div style={{marginTop:10,padding:14,border:"1px solid var(--line)",borderRadius:14,background:bg}}><div style={{fontWeight:800,marginBottom:8}}>Chapter Navigation</div>{readerSubtopics.map((s,i)=><button key={s.id||i} className="btn secondary" style={{display:"block",width:"100%",textAlign:"left",marginTop:6}} onClick={()=>document.getElementById("sub-"+i)?.scrollIntoView({behavior:"smooth"})}>{i+1}. {s.title}</button>)}</div>}
  {showSettings&&<div style={{marginTop:10,padding:14,border:"1px solid var(--line)",borderRadius:14,background:bg}}><div style={{fontWeight:800,marginBottom:8}}>Reading Settings</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}><button className="btn secondary" onClick={()=>setFontScale(Math.max(.9,fontScale-.1))}>A−</button><button className="btn secondary" onClick={()=>setFontScale(Math.min(1.3,fontScale+.1))}>A+</button><button className="btn secondary" onClick={()=>setTheme("light")}>☀ Light</button><button className="btn secondary" onClick={()=>setTheme("paper")}>📜 Paper</button><button className="btn secondary" onClick={()=>setTheme("dark")}>🌙 Dark</button></div></div>}
  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:14}}><button className="btn primary" onClick={translate} disabled={loading}>{loading?"✨ Translating…":marathi?"ENGLISH":"✨ मराठी"}</button></div>
  {error&&<div className="error" style={{marginTop:10}}>{error}</div>}
  <article style={{marginTop:18,background:bg,border:theme==="paper"?"1px solid #e7dcc5":"1px solid var(--line)",borderRadius:24,padding:"clamp(24px,6vw,58px)",boxShadow:theme==="paper"?"0 12px 40px rgba(70,55,30,.08)":"0 8px 30px rgba(0,0,0,.04)"}}>
   <div style={{maxWidth:720,margin:"0 auto"}}>
    <div style={{fontSize:11,fontWeight:850,letterSpacing:".12em",textTransform:"uppercase",opacity:.58,marginBottom:10}}>MPSC STUDY READER</div>
    <h1 style={{fontSize:"clamp(30px,6vw,46px)",lineHeight:1.13,margin:"0 0 30px",letterSpacing:"-.025em"}}>{data.title}</h1>
    <div style={bodyStyle}>{renderBlocks((data as any).content_blocks?.length?(data as any).content_blocks:contentBlocks, data.notes, [])}</div>
    {data.subtopics?.map((s:Sub,i:number)=><section id={"sub-"+i} key={s.id||i} style={{marginTop:48,paddingTop:34,borderTop:"1px solid var(--line)"}}>
      <h2 style={{fontSize:"clamp(24px,5vw,32px)",lineHeight:1.25,margin:"0 0 20px",fontWeight:850}}>{i+1}. {s.title}</h2>
      <div style={bodyStyle}>{renderBlocks(marathi?((s as any).content_blocks):s.content_blocks,s.content,s.important_keywords||[])}</div>
      <div style={{marginTop:24,padding:"15px 16px",borderRadius:15,background:theme==="dark"?"#242424":theme==="paper"?"#efe5d2":"rgba(20,70,120,.045)",border:"1px solid var(--line)"}}>
       <div style={{fontSize:12,fontWeight:900,letterSpacing:".04em",marginBottom:10}}>🔑 IMPORTANT MPSC KEYWORDS</div>
       <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>{Array.isArray(s.important_keywords)&&s.important_keywords.length?s.important_keywords.map((k:Keyword,j:number)=><button key={k.term+j} className="btn secondary" style={{fontSize:12,fontWeight:750,borderRadius:999,padding:"7px 11px"}} onClick={()=>explainKeyword(k)}>{k.term}</button>):<span className="muted" style={{fontSize:13}}>{keywordLoading?"Preparing…":"No keywords available."}</span>}</div>
      </div>
    </section>)}
   </div>
  </article>
  <div style={{marginTop:22,padding:18,border:"1px solid var(--line)",borderRadius:18,background:bg,textAlign:"center"}}><div style={{fontWeight:900,fontSize:16}}>{completed?"✅ Notes Completed":"📖 Finished reading?"}</div><p className="muted" style={{margin:"6px 0 12px"}}>{completed?"This chapter is marked as completed.":"Mark this chapter completed after you finish reading it."}</p><button className={completed?"btn secondary":"btn primary"} onClick={markCompleted} disabled={completing}>{completing?"Saving…":completed?"✓ Marked Completed":"✓ MARK AS COMPLETED"}</button></div>
  {(keyword||explaining||explanation)&&<div style={{position:"fixed",inset:0,zIndex:20,background:"rgba(0,0,0,.52)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>{if(!explaining){setKeyword(null);setExplanation("")}}}><div style={{width:"min(760px,100%)",maxHeight:"82vh",overflowY:"auto",background:bg,color:fg,borderRadius:"24px 24px 0 0",padding:"24px 22px 30px",boxShadow:"0 -12px 45px rgba(0,0,0,.25)"}} onClick={e=>e.stopPropagation()}><div style={{width:42,height:4,borderRadius:4,background:"currentColor",opacity:.25,margin:"0 auto 18px"}}/><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}><div><div style={{fontSize:11,fontWeight:800,opacity:.65,textTransform:"uppercase"}}>{keyword?.category||"Important term"}</div><h2 style={{margin:"4px 0 0",fontSize:26,fontWeight:900}}>✨ {keyword?.term}</h2></div><button className="btn secondary" onClick={()=>{setKeyword(null);setExplanation("")}}>×</button></div><div style={{marginTop:20,lineHeight:1.8,fontSize:16,whiteSpace:"pre-wrap"}}>{explaining?"Preparing a source-based explanation…":renderExplanation(explanation)}</div></div></div>}
 </div>;
}
