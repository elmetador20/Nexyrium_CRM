import { z } from "zod";

export const peopleListSchema = z.object({ search: z.string().trim().max(100).optional(), includeInactive: z.coerce.boolean().default(false), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50) });
export const peopleUpdateSchema = z.object({ name: z.string().trim().min(1, "Enter a name.").max(200).optional(), jobTitle: z.string().trim().max(160).optional().nullable(), employmentStatus: z.enum(["active", "on_leave", "terminated", "contractor"]).optional(), managerUserId: z.string().uuid().optional().nullable(), departmentIds: z.array(z.string().uuid()).max(20).optional(), primaryDepartmentId: z.string().uuid().optional().nullable() }).refine((value) => Object.keys(value).length > 0, "At least one people profile field is required.").refine((value) => !value.primaryDepartmentId || value.departmentIds?.includes(value.primaryDepartmentId), "The primary department must be included in departmentIds when departments are changed.");

export type PeopleListInput = z.infer<typeof peopleListSchema>;
