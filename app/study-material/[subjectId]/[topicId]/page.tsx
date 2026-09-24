import {redirect,notFound} from "next/navigation";
import Link from "next/link";
import ReaderControls from "./ReaderControls";
import {createClient} from "@/lib/supabase/server";

export default async function TopicReader({params}:{params:Promise<{subjectId:string;topicId:string}>}){
 const {subjectId,topicId}=await params;
 const supabase=await createClient();
 const {data}=await supabase.auth.getClaims(); if(!data?.claims)redirect("/login");
 const {data:profile}=await supabase.from("profiles").select("id,role,account_status").eq("id",data.claims.sub).single();
 if(!profile||profile.role!=="student"||profile.account_status!=="active")redirect("/dashboard");
 const {data:subject}=await supabase.from("study_subjects").select("id,subject_name,stage,paper").eq("id",subjectId).eq("status","published").single(); if(!subject)notFound();
 const {data:topic}=await supabase.from("study_topics").select("id,title,notes,sort_order").eq("id",topicId).eq("subject_id",subjectId).eq("status","published").single(); if(!topic)notFound();
 const {data:subs}=await supabase.from("study_subtopics").select("id,title,content,sort_order,important_keywords").eq("topic_id",topicId).order("sort_order");
 const {data:bookmark}=await supabase.from("study_bookmarks").select("id").eq("user_id",profile.id).eq("topic_id",topicId).maybeSingle();
 return <div className="shell" style={{background:"var(--bg)"}}>
  <header className="topbar"><div className="topbarBrand"><img src="/mpsc-logo.png" className="brandLogo dashboardLogo" alt="MPSC ALL-IN-ONE"/><div className="brandSub">READING MODE</div></div></header>
  <main style={{maxWidth:820,margin:"0 auto",padding:"28px 18px 70px"}}>
   <div className="muted" style={{fontSize:12,fontWeight:700}}>{subject.subject_name} · {subject.stage} · {subject.paper}</div>
   <ReaderControls title={topic.title} notes={topic.notes} topicId={topicId} initialBookmarked={!!bookmark} subtopics={(subs||[]).map(s=>({id:s.id,title:s.title,content:s.content,important_keywords:Array.isArray(s.important_keywords)?s.important_keywords:[]}))}/>
   <div style={{display:"flex",justifyContent:"space-between",gap:10,marginTop:18}}><Link className="btn secondary" href={"/study-material/"+subjectId}>← Chapters</Link><Link className="btn primary" href="/dashboard">⌂ Dashboard</Link></div>
  </main>
 </div>;
}