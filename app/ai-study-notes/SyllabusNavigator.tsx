"use client";
import Link from "next/link";
import {useMemo,useState} from "react";

type Node={id:string;parent_id:string|null;node_type:string;title:string;depth:number;source_page:number;source_order:number;is_leaf:boolean};
type Published={id:string;node_id:string;title:string;overview:string|null;content_blocks:any;published_at:string|null;version_no:number};

export default function PublishedNotesLibrary({nodes,publishedRows}:{nodes:Node[];publishedRows:Published[]}){
 const [q,setQ]=useState("");
 const byId=useMemo(()=>new Map(nodes.map(n=>[n.id,n])),[nodes]);
 const published=useMemo(()=>publishedRows.map(note=>{
   const path:Node[]=[]; let cur=byId.get(note.node_id);
   while(cur){path.unshift(cur);cur=cur.parent_id?byId.get(cur.parent_id):undefined}
   return {note,path,subject:path[0]?.title||"Other"};
 }),[publishedRows,byId]);
 const subjects=useMemo(()=>{
   const m=new Map<string,{title:string,items:typeof published}>();
   for(const item of published){const e=m.get(item.subject)||{title:item.subject,items:[]};e.items.push(item);m.set(item.subject,e)}
   return [...m.values()];
 },[published]);
 const query=q.trim().toLowerCase();
 const filtered=subjects.map(s=>({...s,items:s.items.filter(x=>!query||x.note.title.toLowerCase().includes(query)||x.path.some(n=>n.title.toLowerCase().includes(query)))})).filter(s=>s.items.length);
 return <div>
  <input value={q} onChange={e=>setQ(e.target.value)} placeholder="🔍 Search published notes" aria-label="Search published notes" style={{width:"100%",padding:"13px 15px",borderRadius:14,border:"1px solid var(--line)",fontSize:15,marginBottom:14}}/>
  {!published.length?<div className="card"><h3>No published notes yet</h3><p className="muted">Published notes from teachers will appear here.</p></div>:
   !filtered.length?<div className="card"><strong>No published note found</strong><p className="muted">Try another note, chapter, or subject name.</p></div>:
   <div style={{display:"grid",gap:12}}>{filtered.map(s=><section key={s.title} style={{border:"1px solid var(--line)",borderRadius:16,overflow:"hidden",background:"#fff"}}>
    <div style={{padding:"14px 15px",borderBottom:"1px solid var(--line)",background:"var(--bg,#fff)"}}><strong style={{fontSize:18}}>{s.title}</strong><div className="muted" style={{fontSize:12,marginTop:3}}>{s.items.length} published {s.items.length===1?"note":"notes"}</div></div>
    <div style={{display:"grid",gap:8,padding:10}}>{s.items.map(({note,path})=><Link key={note.id} href={"/ai-study-notes/topic/"+note.node_id} style={{textDecoration:"none",color:"inherit",padding:"12px 13px",border:"1px solid var(--line)",borderRadius:13,display:"block"}}>
      <strong style={{fontSize:15}}>{note.title||path[path.length-1]?.title}</strong>
      <div className="muted" style={{fontSize:11,marginTop:4}}>{path.slice(1,-1).map(n=>n.title).join(" › ")||s.title}</div>
      <div style={{fontSize:12,marginTop:7,fontWeight:700}}>OPEN NOTE →</div>
    </Link>)}</div>
   </section>)}</div>}
 </div>
}