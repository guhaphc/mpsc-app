import {redirect,notFound} from "next/navigation";
import Link from "next/link";
import {createClient} from "@/lib/supabase/server";

export default async function TopicReader({params}:{params:Promise<{subjectId:string;topicId:string}>}){
 const {subjectId,topicId}=await params; const supabase=await createClient(); const {data}=await supabase.auth.getClaims(); if(!data?.claims)redirect("/login");
 const {data:profile}=await supabase.from("profiles").select("role,account_status").eq("id",data.claims.sub).single(); if(!profile||profile.role!=="student"||profile.account_status!=="active")redirect("/dashboard");
 const {data:subject}=await supabase.from("study_subjects").select("id,subject_name,stage,paper").eq("id",subjectId).eq("status","published").single(); if(!subject)notFound();
 const {data:topic}=await supabase.from("study_topics").select("id,title,notes,sort_order").eq("id",topicId).eq("subject_id",subjectId).eq("status","published").single(); if(!topic)notFound();
 const {data:subs}=await supabase.from("study_subtopics").select("id,title,content,sort_order").eq("topic_id",topicId).order("sort_order");
 return <div className="shell" style={{background:"var(--bg)"}}>
  <header className="topbar"><div className="topbarBrand"><img src="/mpsc-logo.png" className="brandLogo dashboardLogo" alt="MPSC ALL-IN-ONE"/><div className="brandSub">READING MODE</div></div><div style={{display:"flex",gap:8}}><button className="btn secondary" title="Reading settings">Aa</button><button className="btn secondary" title="Bookmark">🔖</button></div></header>
  <main style={{maxWidth:820,margin:"0 auto",padding:"28px 18px 70px"}}>
   <div className="muted" style={{fontSize:12,fontWeight:700}}>{subject.subject_name} · {subject.stage} · {subject.paper}</div>
   <article style={{marginTop:18,background:"var(--card)",border:"1px solid var(--line)",borderRadius:22,padding:"clamp(22px,5vw,54px)",boxShadow:"0 8px 30px rgba(0,0,0,.04)"}}>
    <h1 style={{fontSize:"clamp(30px,5vw,44px)",lineHeight:1.15,margin:"0 0 28px"}}>{topic.title}</h1>
    <div style={{fontSize:"clamp(17px,2vw,19px)",lineHeight:1.85,whiteSpace:"pre-wrap"}}>{topic.notes}</div>
    {subs?.map((s,i)=><section key={s.id} style={{marginTop:42,paddingTop:30,borderTop:"1px solid var(--line)"}}>
      <h2 style={{fontSize:"clamp(23px,4vw,30px)",lineHeight:1.3,margin:"0 0 18px"}}>{i+1}. {s.title}</h2>
      <div style={{fontSize:"clamp(17px,2vw,19px)",lineHeight:1.85,whiteSpace:"pre-wrap"}}>{s.content}</div>
      <div style={{marginTop:18,padding:"12px 14px",borderRadius:12,background:"rgba(0,0,0,.025)",fontSize:13,fontWeight:700}}>🔑 Important Keywords · ✨ Coming next</div>
    </section>)}
   </article>
   <div style={{display:"flex",justifyContent:"space-between",gap:10,marginTop:18}}><Link className="btn secondary" href={"/study-material/"+subjectId}>← Chapters</Link><Link className="btn primary" href="/dashboard">⌂ Dashboard</Link></div>
  </main>
 </div>;
}