import {redirect} from "next/navigation";
import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import PublishedNotesLibrary from "./SyllabusNavigator";

export default async function AIStudyNotes(){
 const s=await createClient();
 const {data}=await s.auth.getClaims();
 if(!data?.claims)redirect("/login");
 const {data:p}=await s.from("profiles").select("id,role,account_status").eq("id",data.claims.sub).single();
 if(!p||p.role!=="student"||p.account_status!=="active")redirect("/dashboard");

 const {data:src}=await s.from("ai_study_syllabus_sources")
   .select("id,name,exam,academic_year")
   .eq("status","active").order("created_at",{ascending:false}).limit(1).maybeSingle();

 if(!src)return <div className="shell"><header className="topbar"><div className="topbarBrand"><img src="/mpsc-logo.png" className="brandLogo dashboardLogo" alt="MPSC ALL-IN-ONE"/><div className="brandSub">AI STUDY NOTES</div></div><Link className="btn secondary" href="/dashboard">Back</Link></header><main className="main"><section className="card"><h2>Syllabus not available</h2><p className="muted">The teacher has not imported the AI Study Notes syllabus.</p></section></main></div>;

 // Load the current syllabus hierarchy.
 const {data:nodes}=await s.from("ai_study_syllabus_nodes")
   .select("id,parent_id,node_type,title,depth,source_page,source_order,is_leaf")
   .eq("source_id",src.id).order("source_order");
 const all=nodes||[];

 // Load published notes directly instead of sending thousands of syllabus IDs
 // in one .in(...) request. Then keep only notes belonging to the active syllabus.
 const {data:published,error:publishedError}=await s.from("ai_study_note_versions")
   .select("id,node_id,title,overview,content_blocks,published_at,version_no")
   .eq("status","published")
   .order("published_at",{ascending:false});

 const currentNodeIds=new Set(all.map((n:any)=>n.id));
 const publishedRows=publishedError
   ? []
   : (published||[]).filter((n:any)=>currentNodeIds.has(n.node_id));

 return <div className="shell">
  <header className="topbar"><div className="topbarBrand"><img src="/mpsc-logo.png" className="brandLogo dashboardLogo" alt="MPSC ALL-IN-ONE"/><div className="brandSub">AI STUDY NOTES</div></div><Link className="btn secondary" href="/dashboard">Back</Link></header>
  <main className="main">
   <section className="dashboardHero"><div>🤖 AI STUDY NOTES</div><h1>Published Notes</h1><p className="muted">Study only the notes published by your teachers.</p></section>
   <section className="card">
    <div style={{marginBottom:14}}><h2 style={{marginBottom:4}}>{src.exam} · {src.academic_year}</h2><p className="muted" style={{margin:0}}>{publishedRows.length} published notes</p></div>
    <PublishedNotesLibrary nodes={all} publishedRows={publishedRows}/>
   </section>
  </main>
  <nav className="bottomNav"><Link href="/dashboard">⌂<span>Home</span></Link><Link href="/ai-study-notes">▣<span>AI Notes</span></Link><Link href="/dashboard">◉<span>Tests</span></Link><Link href="/dashboard">•••<span>More</span></Link></nav>
 </div>
}