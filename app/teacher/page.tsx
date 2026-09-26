import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";

const cards=[
 ["📚","Study Material","Build syllabus-driven AI Study Notes from the approved Micro Syllabus.","/teacher/study-material"],
 ["📰","Current Affairs","Create and publish exam-focused current affairs.","/teacher/current-affairs"],
 ["📝","Prelims Test Series","Create MCQs, explanations, difficulty and test sets.","/teacher/prelims-tests"],
 ["✍️","Mains Test Series","Create questions, marks, word limits and model-answer points.","/teacher/mains-tests"],
 ["🤖","AI Study Notes","Generate structured study notes from approved source material.","/teacher/ai-study-notes"],
 ["📊","Student Performance","Review test and answer-writing performance.","/teacher/student-performance"]
];

export default async function TeacherDashboard(){
 const supabase=await createClient();
 const {data}=await supabase.auth.getClaims();
 if(!data?.claims)redirect("/login");
 const {data:profile}=await supabase.from("profiles").select("full_name,role,account_status").eq("id",data.claims.sub).single();
 if(!profile)redirect("/login");
 if(profile.role==="admin")redirect("/admin");
 if(profile.role!=="teacher")redirect("/dashboard");
 if(profile.account_status!=="active")return <div className="authWrap"><div className="card"><h2>Registration Pending</h2><p className="muted">Your teacher account is awaiting Admin approval.</p></div></div>;
 return <div className="shell">
  <header className="topbar"><div className="topbarBrand"><img src="/mpsc-logo.png" className="brandLogo dashboardLogo" alt="MPSC ALL-IN-ONE"/><div className="brandSub">TEACHER PORTAL</div></div><form action="/api/auth/signout" method="post"><button className="btn secondary">Logout</button></form></header>
  <main className="main">
   <section className="dashboardHero"><div style={{fontSize:12,fontWeight:700,opacity:.8}}>TEACHER WORKSPACE</div><h1 style={{margin:"6px 0",fontSize:27}}>Welcome, {profile.full_name}</h1><p className="muted">Create, publish and analyse academic content for MPSC learners.</p></section>
   <div className="stats"><div className="stat"><strong>06</strong><span>Academic Areas</span></div><div className="stat"><strong>—</strong><span>Published Notes</span></div><div className="stat"><strong>—</strong><span>Tests Created</span></div><div className="stat"><strong>—</strong><span>Student Reviews</span></div></div>
   <div className="pageHead"><div><h1>Academic Management</h1><div className="muted">Select an area to create and manage content.</div></div></div>
   <div className="grid">{cards.map(([icon,title,desc,href])=><div className="module teacherModule" key={title}><div className="quickIcon">{icon}</div><span className="badge">TEACH</span><h3>{title}</h3><p className="muted">{desc}</p><a className="btn outline" href={href}>OPEN MODULE</a></div>)}</div>
  </main>
  <nav className="bottomNav"><a href="/teacher">⌂<span>Home</span></a><a href="/teacher">▣<span>Content</span></a><a href="/teacher">◉<span>Tests</span></a><a href="/teacher">•••<span>More</span></a></nav>
 </div>;
}
