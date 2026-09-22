import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";

export default async function Dashboard(){
 const supabase=await createClient();const {data}=await supabase.auth.getClaims();if(!data?.claims)redirect("/login");
 const {data:profile}=await supabase.from("profiles").select("full_name,role,account_status").eq("id",data.claims.sub).single();
 if(!profile)redirect("/login");
 if(profile.account_status!=="active"&&profile.role!=="admin")return <div className="authWrap"><div className="card"><h2>Registration Pending</h2><p className="muted">Your account is awaiting Admin approval.</p></div></div>;
 const isStudent=profile.role==="student";
 const modules=profile.role==="admin"?["User Management","Content & Publication","Tests Control","Reports & Analytics","Communication","System & Security"]:profile.role==="teacher"?["Study Note Management","Prelims Test Management","Mains Test Management","Mains Answer Evaluation","Real-Time Tests","Student Report Analysis"]:["Study Material","Syllabus & Progress","Current Affairs","Prelims Tests","Mains Tests","Answer Writing","AI Answer Evaluation","Report Card"];
 const icons=isStudent?["📚","🎯","📰","📝","✍️","🤖","📊","🏆"]:["⚙️","📚","📝","📈","🔔","🛡️"];
 return <div className="shell">
  <header className="topbar"><div className="topbarBrand"><img src="/mpsc-logo.svg" className="brandLogo dashboardLogo" alt="MPSC ALL-IN-ONE"/></div><form action="/api/auth/signout" method="post"><button className="btn secondary">Logout</button></form></header>
  <main className="main">
   {isStudent?<><section className="dashboardHero"><div style={{fontSize:12,fontWeight:700,opacity:.8}}>GOOD TO SEE YOU 👋</div><h1 style={{margin:"6px 0",fontSize:27}}>Hello, {profile.full_name}</h1><p className="muted">Keep going! Your next milestone is within reach.</p><div style={{marginTop:18}}><div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:700,marginBottom:7}}><span>Preparation Progress</span><span>68%</span></div><div className="progress"><span style={{width:"68%"}}/></div></div></section>
   <div className="quickGrid">{[["📚","Study Material","Continue learning"],["🎯","Practice Tests","Test your knowledge"],["📰","Current Affairs","Stay updated"],["🤖","AI Study Notes","Learn smarter"],["📊","Performance","Track your progress"],["🏆","Report Card","See your growth"]].map(([i,t,s])=><div className="quickCard" key={t}><div className="quickIcon">{i}</div><strong>{t}</strong><div className="muted">{s}</div></div>)}</div></>:
   <div className="dashboardHero"><div style={{fontSize:12,fontWeight:700,opacity:.8}}>{profile.role.toUpperCase()} PORTAL</div><h1 style={{margin:"6px 0",fontSize:27}}>Welcome, {profile.full_name}</h1><p className="muted">Manage your MPSC preparation platform from one place.</p></div>}
   <div className="pageHead"><div><h1>{isStudent?"Your Learning Space":profile.role==="teacher"?"Teacher Workspace":"Admin Control Center"}</h1><div className="muted">{isStudent?"Learn → Practice → Analyse → Improve": "Everything you need, organized clearly."}</div></div></div>
   <div className="grid">{modules.map((x,i)=><div className="module" key={x}><div className="quickIcon">{icons[i%icons.length]}</div><span className="badge">{isStudent?"LEARN":"MODULE"}</span><h3>{x}</h3><p className="muted">{isStudent?"Build your progress with guided preparation.":"Coming in the next milestone."}</p></div>)}</div>
  </main>
  <nav className="bottomNav"><a href="/dashboard">⌂<span>Home</span></a><a href="/dashboard">▣<span>Study</span></a><a href="/dashboard">◉<span>Tests</span></a><a href="/dashboard">•••<span>More</span></a></nav>
 </div>;
}