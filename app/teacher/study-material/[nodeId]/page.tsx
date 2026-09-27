"use client";

import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {useParams} from "next/navigation";

type Note={id:string;node_id:string;version_no:number;status:string;title:string;overview:string;content_blocks:any[];keywords:any[];created_at:string};

function blocksToHtml(blocks:any[]){
 return (blocks||[]).map((b:any)=>{
  if(b.type==="rich")return b.html||"";
  if(b.type==="table")return "<table><thead><tr>"+(b.columns||[]).map((x:string)=>"<th>"+x+"</th>").join("")+"</tr></thead><tbody>"+(b.rows||[]).map((r:string[])=>"<tr>"+r.map(x=>"<td>"+x+"</td>").join("")+"</tr>").join("")+"</tbody></table>";
  if(b.type==="bullet"||b.type==="numbered"){const tag=b.type==="bullet"?"ul":"ol";return "<"+tag+">"+(b.items||[]).map((x:string)=>"<li>"+x+"</li>").join("")+"</"+tag+">";}
  const tag=b.type==="heading"?"h2":b.type==="subheading"?"h3":"p";
  return "<"+tag+">"+String(b.text||"")+"</"+tag+">";
 }).join("");
}

export default function NoteWorkspace(){
 const params=useParams<{nodeId:string}>(),id=params.nodeId;
 const[node,setNode]=useState<any>(null),[notes,setNotes]=useState<Note[]>([]),[selected,setSelected]=useState<Note|null>(null);
 const[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[msg,setMsg]=useState(""),[err,setErr]=useState("");
 const[title,setTitle]=useState(""),[overview,setOverview]=useState(""),[html,setHtml]=useState("");
 const[editing,setEditing]=useState(false);
 const editor=useRef<HTMLDivElement>(null);

 async function load(){
  const r=await fetch("/api/teacher/study-material/syllabus/"+id);
  const d=await r.json();
  if(!r.ok)throw new Error(d.error);
  setNode(d.node);
  const loadedNotes=(d.notes||[]) as Note[];
  setNotes(loadedNotes);
  // Open the saved draft automatically. If none exists, show the published
  // note read-only so the teacher can explicitly unpublish it before editing.
  const draft=loadedNotes.find(n=>n.status==="draft");
  const published=loadedNotes.find(n=>n.status==="published");
  if(draft) selectNote(draft);
  else if(published) selectNote(published);
 }
 function selectNote(n:Note){
  setSelected(n);setTitle(n.title);setOverview(n.overview||"");
  const h=blocksToHtml(n.content_blocks||[]);
  setHtml(h);
  setTimeout(()=>{if(editor.current)editor.current.innerHTML=h},0);
 }
 useEffect(()=>{load().catch(e=>setErr(e.message))},[id]);

 async function formatAI(){
  if(!selected)return;
  const source=editor.current?.innerText||html.replace(/<[^>]+>/g," ").trim();
  if(!source.trim())return setErr("There is no text to format.");
  setBusy(true);setErr("");setMsg("");
  try{
   const r=await fetch("/api/teacher/study-material/syllabus/format",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nodeId:id,noteId:selected.id,text:source,sourceType:"paste-draft"})});
   const d=await r.json();if(!r.ok)throw new Error(d.error);
   setMsg("AI formatting completed.");
   if(d.note)selectNote(d.note); else await load();
  }catch(e:any){setErr(e.message||"AI formatting failed")}finally{setBusy(false)}
 }

 async function saveDraft(){
  if(!selected)return;
  const current=editor.current?.innerHTML||html;
  setSaving(true);setErr("");setMsg("");
  try{
   const r=await fetch("/api/teacher/study-material/syllabus/save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({noteId:selected.id,title,overview,content_blocks:[{type:"rich",html:current}],keywords:selected.keywords||[]})});
   const d=await r.json();if(!r.ok)throw new Error(d.error);
   setMsg("Draft saved.");
   if(d.note)selectNote(d.note); else await load();
  }catch(e:any){setErr(e.message||"Could not save draft")}finally{setSaving(false)}
 }

 async function action(type:string){
  if(!selected)return;
  setBusy(true);setErr("");setMsg("");
  try{
   if(type==="delete"){
    if(!confirm("Delete this draft?")){setBusy(false);return}
    const r=await fetch("/api/teacher/study-material/syllabus/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({noteId:selected.id})});
    const d=await r.json();if(!r.ok)throw new Error(d.error);
    setSelected(null);setMsg("Draft deleted.");await load();
   }else{
    const r=await fetch("/api/teacher/study-material/syllabus/publish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({noteId:selected.id,action:type})});
    const d=await r.json();if(!r.ok)throw new Error(d.error);
    if(type==="unpublish"){
     setMsg("Unpublished. The note is now editable.");
     await load();
     const latest=(await (await fetch("/api/teacher/study-material/syllabus/"+id)).json()).notes?.find((n:Note)=>n.id===selected.id);
     if(latest)selectNote(latest);
    }else{
     setMsg("Published to students.");
     await load();
     const latest=(await (await fetch("/api/teacher/study-material/syllabus/"+id)).json()).notes?.find((n:Note)=>n.id===selected.id);
     if(latest)selectNote(latest);
    }
   }
  }catch(e:any){setErr(e.message||"Action failed")}finally{setBusy(false)}
 }

 function command(cmd:string,value?:string){
  if(!editing)return;
  editor.current?.focus();
  document.execCommand(cmd,false,value);
  setHtml(editor.current?.innerHTML||"");
 }
 function clearEditor(){
  if(!selected||selected.status!=="draft"||!editing)return;
  if(!confirm("Clear the current editor? The saved draft will remain unchanged until you press Save Draft."))return;
  if(editor.current)editor.current.innerHTML="";
  setHtml("");
 }
 function beginEdit(){
  if(selected?.status==="draft")setEditing(true);
 }

 return <div className="shell">
  <header className="topbar"><div className="topbarBrand"><img src="/mpsc-logo.png" className="brandLogo dashboardLogo" alt="MPSC ALL-IN-ONE"/><div className="brandSub">AI STUDY NOTES</div></div><Link className="btn secondary" href="/teacher/study-material">Back</Link></header>
  <main className="main">
   {err&&<div className="error" style={{marginBottom:14}}>{err}</div>}
   {msg&&<div className="success" style={{marginBottom:14}}>{msg}</div>}

   <section className="dashboardHero"><div>STUDY NOTE</div><h1 style={{margin:"6px 0",fontSize:26}}>{node?.title||"Loading…"}</h1><p className="muted">{node?"Selected final syllabus topic · source page "+node.source_page:""}</p></section>

   {!selected&&<section className="card">
    <h2>Draft</h2>
    <p className="muted">No saved draft exists for this syllabus topic yet.</p>
    <p className="muted">Create the draft through the existing note-generation/source workflow. This workspace no longer uses a Copy/Paste window.</p>
   </section>}

   {selected&&<section className="card">
    <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}>
     <div><h2 style={{marginBottom:4}}>Draft</h2><p className="muted" style={{margin:0}}>Version {selected.version_no} · {selected.status}</p></div>
    </div>

    <label>Title</label>
    <input value={title} disabled={selected.status!=="draft"||!editing} onChange={e=>setTitle(e.target.value)} style={{width:"100%",margin:"7px 0 12px"}}/>

    {selected.status==="draft"&&<div style={{border:"1px solid var(--line)",borderRadius:12,overflow:"hidden",marginTop:10}}>
      {editing&&<div style={{display:"flex",gap:4,flexWrap:"wrap",padding:8,background:"#f7f8fa"}}>
       <button type="button" className="btn small secondary" onClick={()=>command("bold")}><b>B</b></button>
       <button type="button" className="btn small secondary" onClick={()=>command("italic")}><i>I</i></button>
       <button type="button" className="btn small secondary" onClick={()=>command("underline")}><u>U</u></button>
       <select onChange={e=>command("foreColor",e.target.value)} defaultValue=""><option value="" disabled>Text colour</option><option value="#111827">Black</option><option value="#b91c1c">Red</option><option value="#1d4ed8">Blue</option><option value="#15803d">Green</option></select>
       <button type="button" className="btn small secondary" onClick={()=>command("formatBlock","h2")}>H2</button>
       <button type="button" className="btn small secondary" onClick={()=>command("formatBlock","h3")}>H3</button>
      </div>}
      <div ref={editor} contentEditable={editing} suppressContentEditableWarning onInput={()=>setHtml(editor.current?.innerHTML||"")} style={{minHeight:360,padding:14,lineHeight:1.8,outline:"none",background:editing?"#fff":"#fafafa"}}/>
    </div>}

    {selected.status!=="draft"&&<div style={{padding:"14px 0",lineHeight:1.8}} dangerouslySetInnerHTML={{__html:html}}/>}

    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:14}}>
     {selected.status==="draft"&&<>
      <button className="btn primary" onClick={formatAI} disabled={busy}>✨ AI FORMAT TEXT</button>
      {!editing&&<button className="btn secondary" onClick={beginEdit} disabled={busy}>✏️ EDIT DRAFT</button>}
      {editing&&<button className="btn secondary" onClick={clearEditor} disabled={busy}>CLEAR</button>}
      {editing&&<button className="btn secondary" onClick={saveDraft} disabled={saving}>💾 SAVE DRAFT</button>}
      <button className="btn outline" onClick={()=>action("delete")} disabled={busy}>🗑️ DELETE DRAFT</button>
     </>}
     {selected.status==="published"&&<button className="btn primary" onClick={()=>action("unpublish")} disabled={busy}>🔓 UNPUBLISH TO EDIT</button>}
     {selected.status==="draft"&&<button className="btn primary" onClick={()=>action("publish")} disabled={busy}>📢 PUBLISH</button>}
    </div>
   </section>}

   {selected&&notes.length>1&&<section className="card"><h2>Versions</h2>{notes.map(n=><button key={n.id} className="topicRow" onClick={()=>selectNote(n)} style={{width:"100%",textAlign:"left",marginBottom:6}}><strong>Version {n.version_no} · {n.status}</strong></button>)}</section>}
  </main>
 </div>;
}
