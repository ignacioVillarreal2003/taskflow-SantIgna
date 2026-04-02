import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { ForbiddenError, NotFoundError } from './auth.service'

export const CreateCommentSchema = z.object({
  body: z.string().min(1).max(1000),
})

export class CommentService {
  constructor(private db: PrismaClient) {}

  async addComment(taskId: string, userId: string, input: { body: string }) {
    const parsed = CreateCommentSchema.parse(input)

    const task = await this.db.task.findUnique({
      where: { id: taskId },
      include: { project: { include: { members: true } } },
    })
    if (!task) throw new NotFoundError('Task not found')

    const isMember = task.project.members.some((m: { userId: string }) => m.userId === userId)
    if (!isMember) throw new ForbiddenError('Not a project member')

    return this.db.comment.create({
      data: { body: parsed.body, taskId, authorId: userId },
      include: { author: { select: { id: true, email: true, name: true } } },
    })
  }

  async getComments(taskId: string, userId: string) {
    const task = await this.db.task.findUnique({
      where: { id: taskId },
      include: { project: { include: { members: true } } },
    })
    if (!task) throw new NotFoundError('Task not found')

    const isMember = task.project.members.some((m: { userId: string }) => m.userId === userId)
    if (!isMember) throw new ForbiddenError('Not a project member')

    // BUG-04: should be orderBy: { createdAt: 'asc' }
    return this.db.comment.findMany({
      where: { taskId },
      include: { author: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: 'desc' }, // BUG: descending instead of ascending
    })
  }

  async deleteComment(commentId: string, userId: string) {
    const comment = await this.db.comment.findUnique({
      where: { id: commentId },
    })
    if (!comment) throw new NotFoundError('Comment not found')
    if (comment.authorId !== userId) throw new ForbiddenError('Can only delete your own comments')

    await this.db.comment.delete({ where: { id: commentId } })
  }
}
