import {redirect,notFound} from "next/navigation";
import Link from "next/link";
import {createClient} from "@/lib/supabase/server";

export default async function SubjectPage({params}:{params:Promise<{subjectId:string}>}){
 const {subjectId}=await params; const supabase=await createClient(); const {data}=await supabase.auth.getClaims(); if(!data?.claims)redirect("/login");
 const {data:profile}=await supabase.from("profiles").select("role,account_status").eq("id",data.claims.sub).single(); if(!profile||profile.role!=="student"||profile.account_status!=="active")redirect("/dashboard");
 const {data:subject}=await supabase.from("study_subjects").select("id,subject_name,stage,paper").eq("id",subjectId).eq("status","published").single(); if(!subject)notFound();
 const {data:topics}=await supabase.from("study_topics").select("id,title,notes,sort_order").eq("subject_id",subjectId).eq("status","published").order("sort_order");
 return <div className="shell">
  <header className="topbar"><div className="topbarBrand"><img src="/mpsc-logo.png" className="brandLogo dashboardLogo" alt="MPSC ALL-IN-ONE"/><div className="brandSub">READING</div></div><Link className="btn secondary" href="/study-material">Back</Link></header>
  <main className="main">
   <section className="dashboardHero"><div style={{fontSize:12,fontWeight:700,opacity:.8}}>{subject.stage} · {subject.paper}</div><h1 style={{margin:"6px 0",fontSize:27}}>{subject.subject_name}</h1><p className="muted">Choose a chapter and enter distraction-free reading mode.</p></section>
   {!topics?.length?<section className="card"><p className="muted">No published topics are available yet.</p></section>:<section className="card"><h2>Chapters</h2><div className="topicList">{topics.map((t,i)=><Link key={t.id} href={"/study-material/"+subject.id+"/"+t.id} className="topicRow" style={{textDecoration:"none",color:"inherit"}}><div><strong>{i+1}. {t.title}</strong><div className="muted" style={{fontSize:12,marginTop:5}}>Published · Read notes</div></div><span style={{fontSize:22}}>›</span></Link>)}</div></section>}
  </main>
 </div>;
}