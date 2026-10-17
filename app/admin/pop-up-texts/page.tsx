import AdminActionForm from "@/components/admin/AdminActionForm";
import WallPopupTextEditor from "@/components/admin/WallPopupTextEditor";
import { createClient } from "@/lib/supabase/server";
import { saveWallPopupTexts } from "@/server/admin-actions";

export const dynamic = "force-dynamic";

export default async function AdminPopUpTextsPage() {
  const { data, error } = await createClient().from("website_settings")
    .select("value")
    .eq("key", "wall_popup_texts")
    .maybeSingle();
  if (error) throw new Error(`Could not load Freedom Wall pop-up texts: ${error.message}`);

  let texts: string[] = [];
  if (data) {
    if (!Array.isArray(data.value) || !data.value.every((text): text is string => typeof text === "string")) {
      throw new Error("The saved Freedom Wall pop-up text setting has an invalid format.");
    }
    texts = data.value;
  }

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Freedom Wall pop-up texts</h2>
        <p className="mt-1 text-sm text-slate-500">
          Add a separate field for each short message. They show one at a time above “Your community feed,”
          then cycle back to the first message. These are separate from announcements.
        </p>
      </div>
      <article className="card">
        <AdminActionForm action={saveWallPopupTexts} submitLabel="Save pop-up texts">
          <WallPopupTextEditor initialTexts={texts} />
        </AdminActionForm>
      </article>
    </section>
  );
}
