import { redirect } from "next/navigation";
import { Chat } from "@/components/Chat";
import { createClient } from "@/lib/supabase/server";

export default async function ChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <Chat userId={user.id} userEmail={user.email ?? ""} />;
}
