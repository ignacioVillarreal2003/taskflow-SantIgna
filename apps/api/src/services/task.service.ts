import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { ForbiddenError, NotFoundError, UnprocessableError } from './auth.service'

export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
}

export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export const CreateTaskSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().optional(),
  priority: z.nativeEnum(TaskPriority).default(TaskPriority.MEDIUM),
  assignedTo: z.string().cuid().optional(),
})

export const UpdateTaskSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  assignedTo: z.string().cuid().nullable().optional(),
})

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.TODO]: [TaskStatus.IN_PROGRESS],
  [TaskStatus.IN_PROGRESS]: [TaskStatus.DONE],
  [TaskStatus.DONE]: [],
}

export class TaskService {
  constructor(private db: PrismaClient) {}

  validateStatusTransition(currentStatus: TaskStatus, newStatus: TaskStatus): void {
    const allowed = VALID_TRANSITIONS[currentStatus]
    if (!allowed.includes(newStatus)) {
      throw new UnprocessableError(
        `Transición de estado inválida: ${currentStatus} → ${newStatus}`
      )
    }
  }

  validateTitle(title: string): void {
    const trimmedTitle = title.trim()

    if (!trimmedTitle) {
      throw new Error('El título no puede estar vacío')
    }
    if (trimmedTitle.length < 3) {
      throw new Error('El título debe tener al menos 3 caracteres')
    }
    if (trimmedTitle.length > 100) {
      throw new Error('El título no puede superar los 100 caracteres')
    }
  }

  async createTask(projectId: string, userId: string, input: CreateTaskInput) {
    const parsed = CreateTaskSchema.parse(input)
    this.validateTitle(parsed.title)

    await this.assertProjectMember(projectId, userId)

    return this.db.task.create({
      data: {
        ...parsed,
        projectId,
        status: TaskStatus.TODO,
      },
      include: { assignee: { select: { id: true, email: true, name: true } } },
    })
  }

  async updateTask(taskId: string, userId: string, input: UpdateTaskInput) {
    const parsed = UpdateTaskSchema.parse(input)
    if (parsed.title !== undefined) {
      this.validateTitle(parsed.title)
    }

    const task = await this.db.task.findUnique({
      where: { id: taskId },
      include: { project: { include: { members: true } } },
    })
    if (!task) throw new NotFoundError('Task not found')

    const isMember = task.project.members.some((m: { userId: string }) => m.userId === userId)
    if (!isMember) throw new ForbiddenError('Not a project member')

    if (parsed.status) {
      this.validateStatusTransition(task.status as TaskStatus, parsed.status as TaskStatus)

      // Record history
      await this.db.statusHistory.create({
        data: {
          taskId,
          from: task.status,
          to: parsed.status,
          changedBy: userId,
        },
      })
    }

    return this.db.task.update({
      where: { id: taskId },
      data: parsed,
      include: {
        assignee: { select: { id: true, email: true, name: true } },
        statusHistory: { orderBy: { changedAt: 'asc' } },
      },
    })
  }

  async getTasks(
    projectId: string,
    userId: string,
    filters: {
      status?: TaskStatus
      priority?: TaskPriority
      assignedTo?: string
      search?: string
    }
  ) {
    await this.assertProjectMember(projectId, userId)

    return this.db.task.findMany({
      where: {
        projectId,
        ...(filters.status && { status: filters.status }),
        ...(filters.priority && { priority: filters.priority }),
        // BUG-02: should be { assignedTo: filters.assignedTo }
        // but instead we do a contains check that also matches null rows
        ...(filters.assignedTo && {
          assignedTo: { equals: filters.assignedTo },
        }),
        ...(filters.search && {
          OR: [
            { title: { contains: filters.search, mode: 'insensitive' } },
            { description: { contains: filters.search, mode: 'insensitive' } },
          ],
        }),
      },
      include: {
        assignee: { select: { id: true, email: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  private async assertProjectMember(projectId: string, userId: string) {
    const member = await this.db.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    })
    if (!member) throw new ForbiddenError('Not a project member')
  }
}
