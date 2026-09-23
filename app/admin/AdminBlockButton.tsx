"use client";

export default function AdminBlockButton({userId}:{userId:string}){
  return (
    <form
      action="/api/admin/user-status"
      method="post"
      onSubmit={(e)=>{
        if(!window.confirm("Permanently block this student's name and mobile number?")){
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="user_id" value={userId}/>
      <input type="hidden" name="status" value="blocked"/>
      <button className="btn small danger">Block</button>
    </form>
  );
}
