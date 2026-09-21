import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";

export default async function Dashboard(){
  const supabase=await createClient();
  const {data}=await supabase.auth.getClaims();
  if(!data?.claims)redirect("/login");

  const {data:profile}=await supabase
    .from("profiles")
    .select("full_name,role,account_status")
    .eq("id",data.claims.sub)
    .single();

  if(!profile)redirect("/login");

  if(profile.account_status!=="active"&&profile.role!=="admin"){
    return <div className="authWrap"><div className="card"><h2>Registration Pending</h2><p className="muted">Your account is awaiting Admin approval.</p></div></div>;
  }

  const modules=profile.role==="admin"
    ?["User Management","Content & Publication","Tests Control","Reports & Analytics","Communication","System & Security"]
    :profile.role==="teacher"
    ?["Study Note Management","Prelims Test Management","Mains Test Management","Mains Answer Evaluation","Real-Time Tests","Student Report Analysis"]
    :["Study Material","Syllabus & Progress","Current Affairs","Prelims Tests","Mains Tests","Answer Writing","AI Answer Evaluation","Report Card"];

  return <div className="shell">
    <header className="topbar">
      <div className="brand"><div className="brandMark">MPSC</div><div><div className="brandTitle">MPSC ALL-IN-ONE</div><div className="brandSub">{profile.role.toUpperCase()} DASHBOARD</div></div></div>
      <form action="/api/auth/signout" method="post"><button className="btn secondary">Logout</button></form>
    </header>
    <main className="main">
      <h1>Welcome, {profile.full_name}</h1>
      <p className="muted">Your MPSC preparation journey starts here.</p>
      <div className="grid">{modules.map(x=><div className="module" key={x}><span className="badge">MODULE</span><h3>{x}</h3><p className="muted">Coming in the next milestone.</p></div>)}</div>
    </main>
  </div>;
}
