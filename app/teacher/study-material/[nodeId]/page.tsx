"use client";

import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {useParams} from "next/navigation";

type Note={id:string;node_id:string;version_no:number;status:string;title:string;overview:string;content_blocks:any[];keywords:any[];created_at:string};

function blocksToHtml(blocks:any[]){
 return (blocks||[]).map((b:any)=>{
  if(b.type==="table") return "<table><thead><tr>"+(b.columns||[]).map((x:string)=>"<th>"+x+"</th>").join("")+"</tr></thead><tbody>"+(b.rows||[]).map((r:string[])=>"<tr>"+r.map(x=>"<td>"+x+"</td>").join("")+"</tr>").join("")+"</tbody></table>";
  if(b.type==="bullet"||b.type==="numbered"){const tag=b.type==="bullet"?"ul":"ol";return "<"+tag+">"+(b.items||[]).map((x:string)=>"<li>"+x+"</li>").join("")+"</"+tag+">";}
  const tag=b.type==="heading"?"h2":b.type==="subheading"?"h3":"p";
  return "<"+tag+">"+String(b.text||"")+"</"+tag+">";
 }).join("");
}
function escapeHtml(s:string){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}

export default function NoteWorkspace(){
 const params=useParams<{nodeId:string}>(),id=params.nodeId;
 const [node,setNode]=useState<any>(null),[notes,setNotes]=useState<Note[]>([]),[selected,setSelected]=useState<Note|null>(null);
 const [mode,setMode]=useState<"choose"|"paste"|"upload">("choose"),[text,setText]=useState(""),[file,setFile]=useState<File|null>(null);
 const [busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[msg,setMsg]=useState(""),[err,setErr]=useState("");
 const [title,setTitle]=useState(""),[overview,setOverview]=useState(""),[html,setHtml]=useState("");
 const editor=useRef<HTMLDivElement>(null);

 async function load(){
  const r=await fetch("/api/teacher/study-material/syllabus/"+id);const d=await r.json();if(!r.ok)throw new Error(d.error);
  setNode(d.node);setNotes(d.notes||[]);if(d.notes?.[0]) selectNote(d.notes[0]);
 }
 function selectNote(n:Note){setSelected(n);setTitle(n.title);setOverview(n.overview||"");const h=blocksToHtml(n.content_blocks||[]);setHtml(h);setTimeout(()=>{if(editor.current)editor.current.innerHTML=h},0);}
 useEffect(()=>{load().catch(e=>setErr(e.message))},[id]);

 async function generate(regenerate=false){
  setBusy(true);setErr("");setMsg("");
  try{const r=await fetch("/api/teacher/study-material/syllabus/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nodeId:id,mode:regenerate?"regenerate":"generate"})});const d=await r.json();if(!r.ok)throw new Error(d.error);setMode("choose");setMsg(regenerate?"New draft generated.":"Draft generated and formatted.");await load();}catch(e:any){setErr(e.message||"Generation failed")}finally{setBusy(false)}
 }
 async function formatText(source:string,sourceType:string){
  if(!source.trim())return setErr("Please add some text first.");
  setBusy(true);setErr("");setMsg("");
  try{const r=await fetch("/api/teacher/study-material/syllabus/format",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nodeId:id,text:source,sourceType})});const d=await r.json();if(!r.ok)throw new Error(d.error);setMode("choose");setMsg("AI formatted the material and created a draft.");await load();}catch(e:any){setErr(e.message||"Formatting failed")}finally{setBusy(false)}
 }
 async function doOcr(){
  if(!file)return setErr("Choose a PDF or image first.");
  setBusy(true);setErr("");setMsg("");
  try{const form=new FormData();form.append("file",file);const r=await fetch("/api/teacher/study-material/syllabus/ocr",{method:"POST",body:form});const d=await r.json();if(!r.ok)throw new Error(d.error);setText(d.text||"");setMode("paste");setMsg("OCR completed. Review the extracted text, then continue.");}catch(e:any){setErr(e.message||"OCR failed")}finally{setBusy(false)}
 }
 async function saveDraft(){
  if(!selected)return;
  const current=editor.current?.innerHTML||html;
  setSaving(true);setErr("");setMsg("");
  try{const r=await fetch("/api/teacher/study-material/syllabus/save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({noteId:selected.id,title,overview,content_blocks:[{type:"rich",html:current}],keywords:selected.keywords||[]})});const d=await r.json();if(!r.ok)throw new Error(d.error);setMsg("Draft saved.");await load();}catch(e:any){setErr(e.message||"Could not save draft")}finally{setSaving(false)}
 }
 async function publish(action:string){
  if(!selected)return;setBusy(true);setErr("");setMsg("");
  try{const r=await fetch("/api/teacher/study-material/syllabus/publish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({noteId:selected.id,action})});const d=await r.json();if(!r.ok)throw new Error(d.error);setMsg(action==="publish"?"Published to students.":"Unpublished. You can edit the draft now.");await load();}catch(e:any){setErr(e.message||"Could not update publication")}finally{setBusy(false)}
 }
 function command(cmd:string,value?:string){editor.current?.focus();document.execCommand(cmd,false,value);setHtml(editor.current?.innerHTML||"");}
 function clearUpload(){setFile(null);setText("");setMode("upload");setMsg("");setErr("");}

 return <div className="shell">
  <header className="topbar"><div className="topbarBrand"><img src="/mpsc-logo.png" className="brandLogo dashboardLogo" alt="MPSC ALL-IN-ONE"/><div className="brandSub">AI STUDY NOTES</div></div><Link className="btn secondary" href="/teacher/study-material">Back</Link></header>
  <main className="main">
   {err&&<div className="error" style={{marginBottom:14}}>{err}</div>}{msg&&<div className="success" style={{marginBottom:14}}>{msg}</div>}
   <section className="dashboardHero"><div>CREATE STUDY NOTE</div><h1 style={{margin:"6px 0",fontSize:26}}>{node?.title||"Loading…"}</h1><p className="muted">{node?"Selected final syllabus topic · source page "+node.source_page:""}</p></section>

   {!selected&&<section className="card">
    <h2>Choose a method</h2><p className="muted">AI will format pasted or OCR material automatically.</p>
    <div style={{display:"grid",gap:10,marginTop:14}}>
     <button className="btn primary" onClick={()=>generate(false)} disabled={busy}>✨ GENERATE WITH AI</button>
     <button className="btn secondary" onClick={()=>{setMode("paste");setText("");setErr("");}}>📋 COPY / PASTE TEXT</button>
     <button className="btn secondary" onClick={()=>{setMode("upload");setFile(null);setErr("");}}>📄 UPLOAD PDF / IMAGE</button>
    </div>
   </section>}

   {!selected&&mode==="paste"&&<section className="card">
    <h2>Copy / Paste Text</h2><textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Paste your study material here…" style={{width:"100%",minHeight:240,lineHeight:1.6}}/>
    <div style={{display:"flex",gap:8,marginTop:12}}><button className="btn primary" onClick={()=>formatText(text,"paste")} disabled={busy}>✨ FORMAT & SAVE DRAFT</button><button className="btn secondary" onClick={()=>{setMode("choose");setText("");}}>CANCEL</button></div>
   </section>}

   {!selected&&mode==="upload"&&<section className="card">
    <h2>Upload PDF / Image</h2><input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0]||null)}/>
    {file&&<p className="muted" style={{marginTop:8}}>{file.name}</p>}
    <div style={{display:"flex",gap:8,marginTop:12}}><button className="btn primary" onClick={doOcr} disabled={busy||!file}>{busy?"READING…":"EXTRACT TEXT (OCR)"}</button><button className="btn secondary" onClick={()=>{setMode("choose");setFile(null);}}>CANCEL</button></div>
   </section>}

   {selected&&<section className="card">
    <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}><div><h2 style={{marginBottom:4}}>Draft</h2><p className="muted" style={{margin:0}}>Version {selected.version_no} · {selected.status}</p></div></div>
    <label>Title</label><input value={title} disabled={selected.status!=="draft"} onChange={e=>setTitle(e.target.value)} style={{width:"100%",margin:"7px 0 12px"}}/>
    <label>Overview</label><textarea value={overview} disabled={selected.status!=="draft"} onChange={e=>setOverview(e.target.value)} style={{width:"100%",minHeight:90,margin:"7px 0 12px"}}/>
    {selected.status==="draft"&&<div style={{border:"1px solid var(--line)",borderRadius:12,overflow:"hidden"}}>
      <div style={{display:"flex",gap:4,flexWrap:"wrap",padding:8,background:"#f7f8fa"}}>
       <button type="button" className="btn small secondary" onClick={()=>command("bold")}><b>B</b></button><button type="button" className="btn small secondary" onClick={()=>command("italic")}><i>I</i></button><button type="button" className="btn small secondary" onClick={()=>command("underline")}><u>U</u></button>
       <select onChange={e=>command("foreColor",e.target.value)} defaultValue=""><option value="" disabled>Text colour</option><option value="#111827">Black</option><option value="#b91c1c">Red</option><option value="#1d4ed8">Blue</option><option value="#15803d">Green</option></select>
       <button type="button" className="btn small secondary" onClick={()=>command("formatBlock","h2")}>H2</button><button type="button" className="btn small secondary" onClick={()=>command("formatBlock","h3")}>H3</button>
      </div>
      <div ref={editor} contentEditable suppressContentEditableWarning onInput={()=>setHtml(editor.current?.innerHTML||"")} style={{minHeight:320,padding:14,lineHeight:1.7,outline:"none"}}/>
    </div>}
    {selected.status!=="draft"&&<div style={{padding:"10px 0",lineHeight:1.7}} dangerouslySetInnerHTML={{__html:html}}/>}
    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:14}}>
     {selected.status==="draft"&&<button className="btn primary" onClick={saveDraft} disabled={saving}>💾 SAVE DRAFT</button>}
     <button className="btn secondary" onClick={()=>publish(selected.status==="published"?"unpublish":"publish")} disabled={busy}>{selected.status==="published"?"UNPUBLISH":"PUBLISH"}</button>
     {selected.status==="draft"&&<button className="btn outline" onClick={()=>generate(true)} disabled={busy}>↻ REGENERATE</button>}
    </div>
   </section>}

   {selected&&notes.length>1&&<section className="card"><h2>Versions</h2>{notes.map(n=><button key={n.id} className="topicRow" onClick={()=>selectNote(n)} style={{width:"100%",textAlign:"left",marginBottom:6}}><strong>Version {n.version_no} · {n.status}</strong></button>)}</section>}

   {!selected&&mode==="paste"&&text&&<section className="card"><button className="btn secondary" onClick={()=>setText("")}>CLEAR TEXT</button></section>}
   {mode==="paste"&&text&&<section className="card"><h2>Review text</h2><p className="muted">OCR text can be corrected before AI formatting.</p><textarea value={text} onChange={e=>setText(e.target.value)} style={{width:"100%",minHeight:220,lineHeight:1.6}}/><div style={{display:"flex",gap:8,marginTop:10}}><button className="btn primary" onClick={()=>formatText(text,"ocr")} disabled={busy}>✨ FORMAT & SAVE DRAFT</button><button className="btn secondary" onClick={clearUpload}>CLEAR / UPLOAD AGAIN</button></div></section>}
  </main>
 </div>;
}