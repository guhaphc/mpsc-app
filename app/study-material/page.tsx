import {redirect} from "next/navigation";
import Link from "next/link";
import {createClient} from "@/lib/supabase/server";

export default async function StudyMaterial(){
 const supabase=await createClient();
 const {data}=await supabase.auth.getClaims();
 if(!data?.claims)redirect("/login");
 const {data:profile}=await supabase.from("profiles").select("full_name,role,account_status").eq("id",data.claims.sub).single();
 if(!profile||profile.role!=="student")redirect("/dashboard");
 if(profile.account_status!=="active")redirect("/dashboard");
 const {data:subjects,error}=await supabase.from("study_subjects").select("id,subject_name,stage,paper,updated_at").eq("status","published").order("subject_name");
 return <div className="shell">
  <header className="topbar"><div className="topbarBrand"><img src="/mpsc-logo.png" className="brandLogo dashboardLogo" alt="MPSC ALL-IN-ONE"/><div className="brandSub">STUDY MATERIAL</div></div><Link className="btn secondary" href="/dashboard">Back</Link></header>
  <main className="main">
   <section className="dashboardHero"><div style={{fontSize:12,fontWeight:700,opacity:.8}}>📖 PREMIUM READING</div><h1 style={{margin:"6px 0",fontSize:27}}>Study Material</h1><p className="muted">Teacher-reviewed notes, organized for comfortable long-form reading.</p></section>
   {error?<div className="error">Could not load study material.</div>:!subjects?.length?<section className="card"><h2>Coming soon</h2><p className="muted">No published study material is available yet. Published subjects will appear here automatically.</p></section>:<section className="card"><h2>Published Subjects</h2><div className="topicList">{subjects.map(s=><Link key={s.id} href={"/study-material/"+s.id} className="topicRow" style={{textDecoration:"none",color:"inherit"}}><div><strong>{s.subject_name}</strong><div className="muted" style={{fontSize:12,marginTop:5}}>{s.stage} · {s.paper}</div></div><span style={{fontSize:22}}>›</span></Link>)}</div></section>}
  </main>
  <nav className="bottomNav"><Link href="/dashboard">⌂<span>Home</span></Link><Link href="/study-material">▣<span>Study</span></Link><Link href="/dashboard">◉<span>Tests</span></Link><Link href="/dashboard">•••<span>More</span></Link></nav>
 </div>;
}