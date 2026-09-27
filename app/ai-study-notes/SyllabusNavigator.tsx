"use client";
import Link from "next/link";
import {useMemo,useState} from "react";

type Node={id:string;parent_id:string|null;node_type:string;title:string;depth:number;source_page:number;source_order:number;is_leaf:boolean};
export default function SyllabusNavigator({nodes,publishedIds}:{nodes:Node[];publishedIds:string[]}){
 const [q,setQ]=useState("");
 const published=new Set(publishedIds);
 const byParent=useMemo(()=>{const m=new Map<string|null,Node[]>();for(const n of nodes){const a=m.get(n.parent_id)||[];a.push(n);m.set(n.parent_id,a)}for(const a of m.values())a.sort((x,y)=>x.source_order-y.source_order);return m},[nodes]);
 const descendants=useMemo(()=>{const m=new Map<string,Node[]>();const walk=(id:string):Node[]=>{if(m.has(id))return m.get(id)!;const out=[...(byParent.get(id)||[])];for(const n of [...out])if(!n.is_leaf)out.push(...walk(n.id));m.set(id,out);return out};return walk},[byParent]);
 const matches=(n:Node)=>!q.trim()||n.title.toLowerCase().includes(q.trim().toLowerCase());
 const render=(parent:string|null,level=0):React.ReactNode=>(byParent.get(parent)||[]).map(n=>{
   const children=byParent.get(n.id)||[], allDesc=descendants(n.id)||[], leafCount=allDesc.filter(x=>x.is_leaf).length;
   const directPublished= n.is_leaf && published.has(n.id);
   if(n.is_leaf){
    if(q && !matches(n))return null;
    return <Link key={n.id} href={"/ai-study-notes/topic/"+n.id} className="topicRow" style={{textDecoration:"none",color:"inherit",display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",padding:"13px 14px",border:"1px solid var(--line)",borderRadius:14,background:"#fff"}}>
      <div><strong style={{fontSize:15}}>{n.title}</strong><div className="muted" style={{fontSize:11,marginTop:3}}>Source page {n.source_page} · {directPublished?"✓ Notes available":"Coming soon"}</div></div>
      <span className="btn outline small" style={{whiteSpace:"nowrap"}}>{directPublished?"OPEN":"VIEW"}</span>
    </Link>
   }
   if(q && !matches(n) && !allDesc.some(x=>matches(x)))return null;
   return <details key={n.id} open={!!q && (matches(n)||allDesc.some(x=>matches(x)))} style={{marginBottom:8,border:"1px solid var(--line)",borderRadius:15,background:"#fff",overflow:"hidden"}}>
    <summary style={{cursor:"pointer",padding:"14px 15px",listStyle:"none"}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}>
       <div><strong style={{fontSize:level===0?18:16}}>{n.title}</strong><div className="muted" style={{fontSize:11,marginTop:3}}>{leafCount} topics · Source page {n.source_page}</div></div>
       <span style={{fontSize:18}}>›</span>
      </div>
    </summary>
    <div style={{padding:"0 10px 10px 18px"}}>{render(n.id,level+1)}</div>
   </details>
 });
 return <div>
   <div style={{position:"sticky",top:0,zIndex:3,background:"var(--bg,#fff)",padding:"4px 0 12px"}}>
    <input value={q} onChange={e=>setQ(e.target.value)} placeholder="🔍 Search syllabus or notes" aria-label="Search syllabus or notes" style={{width:"100%",padding:"13px 15px",borderRadius:14,border:"1px solid var(--line)",fontSize:15}}/>
   </div>
   <div style={{display:"grid",gap:8}}>{render(null)}</div>
   {q&&!nodes.some(n=>matches(n))&&<div className="card" style={{marginTop:12}}><strong>No matching topic found</strong><p className="muted">Try a broader syllabus or note name.</p></div>}
 </div>
}