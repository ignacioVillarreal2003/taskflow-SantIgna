import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { ProjectService } from '../services/project.service'
import { TaskPriority, TaskService, TaskStatus } from '../services/task.service'
import { CommentService } from '../services/comment.service'
import { requireAuth, AuthRequest } from '../middleware/auth.middleware'

const router = Router()
const prisma = new PrismaClient()
const projectService = new ProjectService(prisma)
const taskService = new TaskService(prisma)
const commentService = new CommentService(prisma)

// ── Projects ──────────────────────────────────────────────────
router.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const projects = await projectService.listProjects(req.userId!)
    res.json(projects)
  } catch (err) { next(err) }
})

router.post('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const project = await projectService.createProject(req.userId!, req.body)
    res.status(201).json(project)
  } catch (err) { next(err) }
})

router.get('/:projectId', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const project = await projectService.getProject(req.params.projectId, req.userId!)
    res.json(project)
  } catch (err) { next(err) }
})

router.patch('/:projectId/archive', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const project = await projectService.archiveProject(req.params.projectId, req.userId!)
    res.json(project)
  } catch (err) { next(err) }
})

// ── Tasks ─────────────────────────────────────────────────────
router.get('/:projectId/tasks', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { status, priority, assignedTo, search } = req.query
    const tasks = await taskService.getTasks(req.params.projectId, req.userId!, {
      status: status as TaskStatus | undefined,
      priority: priority as TaskPriority | undefined,
      assignedTo: assignedTo as string | undefined,
      search: search as string | undefined,
    })
    res.json(tasks)
  } catch (err) { next(err) }
})

router.post('/:projectId/tasks', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const task = await taskService.createTask(req.params.projectId, req.userId!, req.body)
    res.status(201).json(task)
  } catch (err) { next(err) }
})

// ── Comments ──────────────────────────────────────────────────
router.get('/:projectId/tasks/:taskId/comments', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const comments = await commentService.getComments(req.params.taskId, req.userId!)
    res.json(comments)
  } catch (err) { next(err) }
})

router.post('/:projectId/tasks/:taskId/comments', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const comment = await commentService.addComment(req.params.taskId, req.userId!, req.body)
    res.status(201).json(comment)
  } catch (err) { next(err) }
})

export default router
