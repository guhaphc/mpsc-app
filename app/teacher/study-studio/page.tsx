"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {createClient} from "@/lib/supabase/client";

type Block={type:string;text?:string;items?:string[];html?:string};
type Topic={id:string;title:string;notes:string;content_blocks:Block[];status:string;subject_id:string};
type Subject={id:string;subject_name:string;stage:string;paper:string;status:string;topics:Topic[]};

function esc(v:any){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function blocksToHtml(blocks:Block[]){return blocks.map((b:any)=>b.type==="richtext"&&b.html?b.html:b.type==="heading"?'<h2>'+esc(b.text)+'</h2>':b.type==="subheading"?'<h3>'+esc(b.text)+'</h3>':b.type==="bullet"?'<ul>'+(b.items||[]).map((x:string)=>'<li>'+esc(x)+'</li>').join("")+'</ul>':b.type==="numbered"?'<ol>'+(b.items||[]).map((x:string)=>'<li>'+esc(x)+'</li>').join("")+'</ol>':b.type==="callout"?'<blockquote>'+esc(b.text)+'</blockquote>':b.text?'<p>'+esc(b.text)+'</p>':"").join("")}

export default function StudyStudio(){
 const [subject,setSubject]=useState(""),[stage,setStage]=useState("Mains"),[paper,setPaper]=useState("GS Paper IV"),[topicTitle,setTopicTitle]=useState(""),[file,setFile]=useState<File|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState(""),[topic,setTopic]=useState<Topic|null>(null),[subjects,setSubjects]=useState<Subject[]>([]),[editing,setEditing]=useState(true),[preview,setPreview]=useState(false),[toolbarOpen,setToolbarOpen]=useState(false);
 const editor=useRef<HTMLDivElement>(null);
 async function load(){const s=createClient();const {data:{user}}=await s.auth.getUser();if(!user)return;const {data:subs}=await s.from("study_subjects").select("id,subject_name,stage,paper,status").eq("created_by",user.id).eq("content_area","teacher").order("created_at",{ascending:false});const ids=(subs||[]).map(x=>x.id);if(!ids.length){setSubjects([]);return;}const {data:tops}=await s.from("study_topics").select("id,subject_id,title,notes,content_blocks,status").in("subject_id",ids).order("sort_order");const grouped=new Map<string,Topic[]>();for(const t of(tops||[])){const a=grouped.get(t.subject_id)||[];a.push(t as Topic);grouped.set(t.subject_id,a)}setSubjects((subs||[]).map(s=>({...s,topics:grouped.get(s.id)||[]})) as Subject[])}
 useEffect(()=>{load()},[]);
 function openTopic(t:Topic){setTopic(t);setTopicTitle(t.title);setSubject(subjects.find(s=>s.id===t.subject_id)?.subject_name||"");setEditing(false);setTimeout(()=>{if(editor.current)editor.current.innerHTML=blocksToHtml(t.content_blocks||[])},0);setError("");setMessage("");window.scrollTo({top:0,behavior:"smooth"})}
 function format(cmd:string,value?:string){editor.current?.focus();document.execCommand(cmd,false,value)}
 const fontLevels=[12,14,16,18,20,22,24,28];
 function currentBlockElements(){
  const root=editor.current;if(!root)return [] as HTMLElement[];
  const sel=window.getSelection();if(!sel||!sel.rangeCount)return [];
  const range=sel.getRangeAt(0);const all=Array.from(root.querySelectorAll("p,h1,h2,h3,h4,div,li,blockquote")) as HTMLElement[];
  const hit=all.filter(el=>{try{return range.intersectsNode(el)}catch{return false}});
  if(hit.length)return hit;
  const node=sel.anchorNode?.nodeType===3?sel.anchorNode.parentElement:sel.anchorNode as HTMLElement|null;
  const block=node?.closest?.("p,h1,h2,h3,h4,div,li,blockquote") as HTMLElement|null;
  return block?[block]:[];
 }
 function setBlockStyle(name:string,value:string){
  const blocks=currentBlockElements();if(!blocks.length)return;
  blocks.forEach(el=>el.style.setProperty(name,value));
 }
 function lineSpacing(delta:number){
  const blocks=currentBlockElements();if(!blocks.length)return;
  const first=parseFloat(getComputedStyle(blocks[0]).lineHeight)/parseFloat(getComputedStyle(blocks[0]).fontSize);
  const base=Number.isFinite(first)?first:1.5;
  const next=Math.min(2.5,Math.max(1,Math.round((base+delta)*100)/100));
  blocks.forEach(el=>el.style.lineHeight=String(next));
 }
 function paragraphSpacing(delta:number){
  const blocks=currentBlockElements();if(!blocks.length)return;
  const first=parseFloat(getComputedStyle(blocks[0]).marginBottom);
  const base=Number.isFinite(first)?first:8;
  const next=Math.min(40,Math.max(0,Math.round((base+delta)/2)*2));
  blocks.forEach(el=>el.style.marginBottom=String(next)+"px");
 }
 function normalizeFontTags(){
  const root=editor.current;if(!root)return;
  const map:Record<string,string>={"1":"12px","2":"14px","3":"16px","4":"18px","5":"20px","6":"24px","7":"28px"};
  root.querySelectorAll("font[size]").forEach(node=>{
   const el=node as HTMLElement;const size=el.getAttribute("size")||"3";el.style.fontSize=map[size]||"16px";
   el.removeAttribute("size");
  });
 }
 function selectedFontSize(){
  const sel=window.getSelection();
  const node=sel?.anchorNode?.nodeType===3?sel.anchorNode.parentElement:sel?.anchorNode as HTMLElement|null;
  return parseFloat(node?getComputedStyle(node).fontSize:"16")||16;
 }
 function changeFontSize(delta:number){
  const current=selectedFontSize();
  const index=fontLevels.reduce((best,value,i)=>Math.abs(value-current)<Math.abs(fontLevels[best]-current)?i:best,0);
  const nextIndex=Math.min(fontLevels.length-1,Math.max(0,index+(delta>0?1:-1)));
  document.execCommand("fontSize",false,String(nextIndex+1));
  normalizeFontTags();
 }
 function setExactFontSize(px:number){
  const index=fontLevels.indexOf(px);
  if(index<0)return;
  document.execCommand("fontSize",false,String(index+1));
  normalizeFontTags();
 }
 function sanitizePastedHtml(input:string){
  const doc=new DOMParser().parseFromString(input,"text/html");
  const allowed=new Set(["P","BR","DIV","SPAN","H1","H2","H3","H4","STRONG","B","EM","I","U","UL","OL","LI","BLOCKQUOTE","A","FONT"]);
  const styles=new Set(["color","background-color","font-family","font-size","font-weight","font-style","text-decoration","text-align","line-height","margin-top","margin-bottom"]);
  const walk=(el:Element)=>{
   Array.from(el.children).forEach(walk);
   if(!allowed.has(el.tagName)){el.replaceWith(...Array.from(el.childNodes));return;}
   Array.from(el.attributes).forEach(a=>{
    const n=a.name.toLowerCase();
    if(n.startsWith("on")||n==="class"||n==="id"||n==="contenteditable"||n==="style"&&false)el.removeAttribute(a.name);
   });
   if(el.hasAttribute("style")){const safe=Array.from(el.getAttribute("style")!.split(";")).map(x=>x.trim()).filter(Boolean).filter(x=>styles.has(x.split(":")[0].trim().toLowerCase())).join("; ");safe?el.setAttribute("style",safe):el.removeAttribute("style");}
   if(el.tagName==="A"){const href=el.getAttribute("href")||"";if(!/^(https?:|mailto:)/i.test(href))el.removeAttribute("href");else{el.setAttribute("target","_blank");el.setAttribute("rel","noopener noreferrer");}}
  };
  Array.from(doc.body.children).forEach(walk);return doc.body.innerHTML;
 }
 function handlePaste(e:React.ClipboardEvent<HTMLDivElement>){
  if(!editing)return;
  const html=e.clipboardData.getData("text/html");
  if(html){e.preventDefault();editor.current?.focus();document.execCommand("insertHTML",false,sanitizePastedHtml(html));return;}
  const text=e.clipboardData.getData("text/plain");
  if(text){e.preventDefault();editor.current?.focus();const safe=text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").split("\r\n").join("<br>").split("\n").join("<br>");document.execCommand("insertHTML",false,safe);}
 }
 async function importPdf(){if(!subject.trim()||!topicTitle.trim()||!file){setError("Enter subject, topic and select a PDF.");return}if(file.size>50*1024*1024){setError("PDF must be 50 MB or smaller.");return}setBusy(true);setError("");setMessage("");try{const s=createClient();const {data:{user}}=await s.auth.getUser();if(!user)throw new Error("Please login again.");const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_"),path=user.id+"/"+crypto.randomUUID()+"-"+safe;const {error:u}=await s.storage.from("study-sources").upload(path,file,{contentType:"application/pdf",upsert:false});if(u)throw new Error("Source upload failed: "+u.message);const form=new FormData();form.append("subject",subject);form.append("stage",stage);form.append("paper",paper);form.append("topicTitle",topicTitle);form.append("sourcePath",path);form.append("sourceName",file.name);const r=await fetch("/api/teacher/study-studio/import",{method:"POST",body:form});const d=await r.json();if(!r.ok)throw new Error(d.error||"Import failed.");setTopic({id:d.topicId,subject_id:d.subjectId,title:topicTitle,notes:"",content_blocks:d.blocks||[],status:"draft"});setEditing(true);setFile(null);setMessage("PDF imported. Format the complete material in one editor.");setTimeout(()=>{if(editor.current)editor.current.innerHTML=blocksToHtml(d.blocks||[])},0);await load()}catch(e:any){setError(e.message||"Import failed")}finally{setBusy(false)}}
 function html(){return editor.current?.innerHTML||""}
 async function aiFormatAll(){
  if(!topic||!editor.current)return;
  const source=html();
  if(!source.replace(/<[^>]+>/g,"").trim()){setError("Editor is empty.");return}
  if(!confirm("AI will format the complete material without rewriting, summarising or changing the content. Continue?"))return;
  setBusy(true);setError("");setMessage("");
  try{
   const r=await fetch("/api/teacher/study-studio/ai-format",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({html:source})});
   const d=await r.json();
   if(!r.ok)throw new Error(d.error||"AI formatting failed.");
   editor.current.innerHTML=d.html;
   setEditing(true);
   setMessage("✨ AI formatting complete. Review the material, then save to Drafts.");
  }catch(e:any){setError(e.message||"Could not format material with AI.")}finally{setBusy(false)}
 }
 async function saveDraft(){if(!topic)return;setBusy(true);setError("");setMessage("");try{const r=await fetch("/api/teacher/study-studio/save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topicId:topic.id,title:topicTitle,content_html:html()})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Save failed.");setTopic({...topic,...d.topic});setEditing(false);setMessage("Saved to Drafts. Students cannot see it yet.");await load()}catch(e:any){setError(e.message||"Could not save")}finally{setBusy(false)}}
 async function publish(){if(!topic)return;if(!html().trim()){setError("Editor is empty.");return}await saveDraft();if(!confirm("Publish this material to students?"))return;setBusy(true);try{const r=await fetch("/api/teacher/study-studio/publish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topicId:topic.id,action:"publish"})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Publish failed.");setTopic(t=>t?{...t,status:"published"}:t);setMessage("Published successfully to students.");await load()}catch(e:any){setError(e.message||"Could not publish")}finally{setBusy(false)}}
 const Tool=({label,cmd,value}:{label:string;cmd:string;value?:string})=><button type="button" className="btn secondary small" title={label} onMouseDown={e=>e.preventDefault()} onClick={()=>format(cmd,value)}>{label}</button>;
 return <div className="shell"><header className="topbar"><div className="topbarBrand"><img src="/mpsc-logo.png" className="brandLogo dashboardLogo" alt="MPSC ALL-IN-ONE"/><div className="brandSub">STUDY MATERIAL STUDIO</div></div><Link className="btn secondary" href="/teacher">Back</Link></header><main className="main">
 <section className="dashboardHero"><div style={{fontSize:12,fontWeight:800}}>TEACHER CONTENT STUDIO</div><h1 style={{margin:"6px 0",fontSize:28}}>Study Material Studio</h1><p className="muted">Upload the original PDF, then polish the complete material in one professional editor.</p></section>
 {error&&<div className="error" style={{marginBottom:14}}>{error}</div>}{message&&<div className="success" style={{marginBottom:14}}>{message}</div>}
 <section className="card"><h2>1. Upload Original PDF</h2><div className="formGrid"><label>Subject<input className="input" value={subject} onChange={e=>setSubject(e.target.value)} placeholder="e.g. Ethics"/></label><label>Stage<select className="select" value={stage} onChange={e=>setStage(e.target.value)}><option>Prelims</option><option>Mains</option></select></label><label>Paper<select className="select" value={paper} onChange={e=>setPaper(e.target.value)}><option>GS Paper I</option><option>GS Paper II</option><option>GS Paper III</option><option>GS Paper IV</option></select></label><label>Chapter / Topic<input className="input" value={topicTitle} onChange={e=>setTopicTitle(e.target.value)} placeholder="e.g. Introduction to Ethics"/></label></div><input type="file" accept=".pdf,application/pdf" onChange={e=>setFile(e.target.files?.[0]||null)} style={{marginTop:14}}/>{file&&<div className="success" style={{marginTop:10}}>✓ {file.name}</div>}<button className="btn primary" style={{marginTop:12}} onClick={importPdf} disabled={busy||!file}>{busy?"IMPORTING…":"UPLOAD & OPEN EDITOR"}</button></section>
 {topic&&<section className="card"><div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}><div><h2 style={{marginBottom:4}}>{topicTitle}</h2><span className="badge">{topic.status==="published"?"PUBLISHED":"DRAFT"}</span></div><div style={{display:"flex",gap:7,flexWrap:"wrap"}}><button className="btn secondary small" onClick={()=>setEditing(false)}>View</button><button className="btn secondary small" onClick={()=>setEditing(true)}>Edit</button><button className="btn secondary small" onClick={()=>setPreview(true)}>Preview</button></div></div><input className="input" value={topicTitle} onChange={e=>setTopicTitle(e.target.value)} style={{margin:"14px 0"}}/>
 {editing&&<div style={{marginBottom:12}}>
 <button type="button" className="btn secondary small" onMouseDown={e=>e.preventDefault()} onClick={()=>setToolbarOpen(v=>!v)} style={{width:"100%",justifyContent:"space-between",display:"flex",alignItems:"center",padding:"10px 14px",borderRadius:12,fontWeight:700}}>
  <span>🛠 Formatting Tools</span><span>{toolbarOpen?"⌃":"⌄"}</span>
 </button>
 {toolbarOpen&&<div className="studyToolbar" style={{display:"flex",gap:6,flexWrap:"wrap",padding:10,border:"1px solid var(--line)",borderBottom:0,borderRadius:"16px 16px 0 0",background:"#172033",position:"relative",zIndex:1,boxShadow:"0 8px 22px rgba(15,23,42,.22)"}}><button type="button" className="btn primary small" title="AI formats the complete material without changing its content" onMouseDown={e=>e.preventDefault()} onClick={aiFormatAll} disabled={busy}>✨ AI FORMAT ALL</button><select className="select" style={{width:120}} onChange={e=>format("formatBlock",e.target.value)} defaultValue="p"><option value="p">Paragraph</option><option value="h1">Title</option><option value="h2">Heading</option><option value="h3">Subheading</option></select><select className="select" style={{width:110}} onChange={e=>format("fontName",e.target.value)} defaultValue="Arial"><option>Arial</option><option>Georgia</option><option>Verdana</option><option>Noto Sans</option><option>Noto Sans Devanagari</option></select><button type="button" className="btn secondary small" title="Decrease font size" onMouseDown={e=>e.preventDefault()} onClick={()=>changeFontSize(-1)}>A−</button><select className="select" style={{width:105}} onChange={e=>setExactFontSize(Number(e.target.value))} defaultValue="16"><option value="12">12 px</option><option value="14">14 px</option><option value="16">16 px</option><option value="18">18 px</option><option value="20">20 px</option><option value="22">22 px</option><option value="24">24 px</option><option value="28">28 px</option></select><button type="button" className="btn secondary small" title="Increase font size" onMouseDown={e=>e.preventDefault()} onClick={()=>changeFontSize(1)}>A+</button><Tool label="B" cmd="bold"/><Tool label="I" cmd="italic"/><Tool label="U" cmd="underline"/><Tool label="Text color" cmd="foreColor" value="#b91c1c"/><Tool label="Highlight" cmd="hiliteColor" value="#fff2a8"/><Tool label="• Bullets" cmd="insertUnorderedList"/><Tool label="1. Numbering" cmd="insertOrderedList"/><Tool label="↶" cmd="undo"/><Tool label="↷" cmd="redo"/><Tool label="←" cmd="justifyLeft"/><Tool label="↔" cmd="justifyCenter"/><Tool label="→" cmd="justifyRight"/><button type="button" className="btn secondary small" title="Decrease line spacing" onMouseDown={e=>e.preventDefault()} onClick={()=>lineSpacing(-0.15)}>Line −</button><select className="select" style={{width:105}} onChange={e=>setBlockStyle("line-height",e.target.value)} defaultValue=""><option value="" disabled>Line spacing</option><option value="1">1.0</option><option value="1.15">1.15</option><option value="1.3">1.3</option><option value="1.5">1.5</option><option value="1.75">1.75</option><option value="2">2.0</option></select><button type="button" className="btn secondary small" title="Increase line spacing" onMouseDown={e=>e.preventDefault()} onClick={()=>lineSpacing(0.15)}>Line +</button><button type="button" className="btn secondary small" title="Decrease paragraph spacing" onMouseDown={e=>e.preventDefault()} onClick={()=>paragraphSpacing(-4)}>Para −</button><button type="button" className="btn secondary small" title="Increase paragraph spacing" onMouseDown={e=>e.preventDefault()} onClick={()=>paragraphSpacing(4)}>Para +</button></div>
 </div>}
 </div>}
 <div ref={editor} contentEditable={editing} suppressContentEditableWarning onPaste={handlePaste} style={{minHeight:"62vh",padding:"34px clamp(18px,4vw,46px)",border:"1px solid var(--line)",borderRadius:18,background:"#fff",boxShadow:"0 10px 30px rgba(15,23,42,.08)",fontFamily:"Arial, Noto Sans Devanagari, sans-serif",fontSize:17,lineHeight:1.85,outline:"none",overflowWrap:"anywhere"}}/>
 <div style={{display:"flex",gap:9,flexWrap:"wrap",marginTop:16}}><button className="btn secondary" onClick={saveDraft} disabled={busy||!editing}>{busy?"SAVING…":"💾 SAVE TO DRAFTS"}</button><button className="btn primary" onClick={publish} disabled={busy}>{busy?"PUBLISHING…":"🌐 PUBLISH"}</button></div></section>}
 <section className="card"><h2>Draft & Published Library</h2><p className="muted">Only Published material is visible to students.</p>{subjects.map(s=><div key={s.id} style={{borderTop:"1px solid var(--line)",padding:"12px 0"}}><strong>{s.subject_name}</strong><div className="muted" style={{fontSize:12}}>{s.stage} · {s.paper} · {s.status}</div>{s.topics.map(t=><button key={t.id} className="topicRow" onClick={()=>openTopic(t)} style={{width:"100%",textAlign:"left",marginTop:7}}><strong>{t.title}</strong><span className="muted"> · {t.status}</span></button>)}</div>)}{!subjects.length&&<p className="muted">No study material yet.</p>}</section>
 </main>{preview&&<div style={{position:"fixed",inset:0,zIndex:50,background:"rgba(0,0,0,.55)",padding:"4vh 3vw",overflowY:"auto"}}><div className="card" style={{maxWidth:850,margin:"0 auto",minHeight:"90vh"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2>Student Preview</h2><button className="btn secondary" onClick={()=>setPreview(false)}>Close</button></div><article style={{marginTop:20,lineHeight:1.9,fontSize:18}} dangerouslySetInnerHTML={{__html:html()}}/></div></div>}</div>;
}