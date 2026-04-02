import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { ConflictError, ForbiddenError, NotFoundError } from './auth.service'

export const CreateProjectSchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().max(500).optional(),
})

export const UpdateProjectSchema = z.object({
  name: z.string().min(3).max(100).optional(),
  description: z.string().max(500).optional(),
})

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>

export class ProjectService {
  constructor(private db: PrismaClient) {}

  async createProject(userId: string, input: CreateProjectInput) {
    const parsed = CreateProjectSchema.parse(input)

    const existing = await this.db.project.findFirst({
      where: { ownerId: userId, name: parsed.name, archived: false },
    })
    if (existing) throw new ConflictError('Project name already exists')

    const project = await this.db.project.create({
      data: {
        ...parsed,
        ownerId: userId,
        members: {
          create: { userId, role: 'OWNER' },
        },
      },
    })

    return project
  }

  async listProjects(userId: string) {
    // BUG-06: when archived=false filter is missing from the query,
    // all projects including archived ones are returned.
    // Fix: add archived: false to the where clause.
    return this.db.project.findMany({
      where: {
        members: { some: { userId } },
        // archived: false  <-- intentionally omitted (BUG-06)
      },
      include: {
        owner: { select: { id: true, email: true, name: true } },
        _count: { select: { tasks: true, members: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async getProject(projectId: string, userId: string) {
    const project = await this.db.project.findUnique({
      where: { id: projectId },
      include: {
        owner: { select: { id: true, email: true, name: true } },
        members: { include: { user: { select: { id: true, email: true, name: true } } } },
        _count: { select: { tasks: true } },
      },
    })
    if (!project) throw new NotFoundError('Project not found')

    const isMember = project.members.some((m: { userId: string }) => m.userId === userId)
    if (!isMember) throw new ForbiddenError('Not a project member')

    return project
  }

  async archiveProject(projectId: string, userId: string) {
    const project = await this.db.project.findUnique({
      where: { id: projectId },
    })
    if (!project) throw new NotFoundError('Project not found')
    if (project.ownerId !== userId) throw new ForbiddenError('Only the owner can archive a project')

    return this.db.project.update({
      where: { id: projectId },
      data: { archived: true },
    })
  }
}
