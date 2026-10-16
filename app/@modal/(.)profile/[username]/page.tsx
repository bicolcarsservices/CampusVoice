import FloatingModal from "@/components/FloatingModal";
import PublicProfilePage from "@/app/profile/[username]/page";

export default function PublicProfileModalPage({ params }: { params: { username: string } }) {
  return <FloatingModal><PublicProfilePage params={params} /></FloatingModal>;
}
