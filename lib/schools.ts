export type SchoolOption = { id: string; name: string };

export function resolveSchoolName(
  value: string,
  schools: SchoolOption[],
): { schoolId: string | null; schoolName: string | null } {
  const name = value.trim();
  if (!name) return { schoolId: null, schoolName: null };

  const existing = schools.find((school) => school.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  return existing
    ? { schoolId: existing.id, schoolName: existing.name }
    : { schoolId: null, schoolName: name };
}
