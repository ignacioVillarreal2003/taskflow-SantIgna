// tests/unit/task.state-machine.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TaskService, TaskStatus } from '../../src/services/task.service'
import { UnprocessableError } from '../../src/services/auth.service'

const mockMember = { userId: 'user-1', role: 'MEMBER' }

function makeTask(status: TaskStatus, assignedTo = 'user-1') {
  return {
    id: 'task-1',
    title: 'Test task',
    status,
    priority: 'MEDIUM',
    projectId: 'proj-1',
    assignedTo,
    project: { members: [mockMember] },
  }
}

const mockDb = {
  task: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  statusHistory: { create: vi.fn() },
  projectMember: { findUnique: vi.fn() },
}

const taskService = new TaskService(mockDb as any)

// ════════════════════════════════════════════════════════════════
// US-06: Máquina de estados
// ════════════════════════════════════════════════════════════════
describe('TaskService — máquina de estados (US-06)', () => {

  beforeEach(() => {
    mockDb.statusHistory.create.mockResolvedValue({})
    mockDb.task.update.mockResolvedValue({ id: 'task-1' })
  })

  describe('Transiciones VÁLIDAS', () => {
    it('TODO → IN_PROGRESS ✓', async () => {
      mockDb.task.findUnique.mockResolvedValue(makeTask(TaskStatus.TODO))

      await expect(
        taskService.updateTask('task-1', 'user-1', { status: TaskStatus.IN_PROGRESS })
      ).resolves.toBeDefined()
    })

    it('IN_PROGRESS → DONE ✓', async () => {
      mockDb.task.findUnique.mockResolvedValue(makeTask(TaskStatus.IN_PROGRESS))

      await expect(
        taskService.updateTask('task-1', 'user-1', { status: TaskStatus.DONE })
      ).resolves.toBeDefined()
    })
  })

  describe('Transiciones INVÁLIDAS', () => {
    it('TODO → DONE ✗ (saltar IN_PROGRESS)', async () => {
      mockDb.task.findUnique.mockResolvedValue(makeTask(TaskStatus.TODO))

      await expect(
        taskService.updateTask('task-1', 'user-1', { status: TaskStatus.DONE })
      ).rejects.toThrow(UnprocessableError)
    })

    it('TODO → DONE: mensaje de error describe la transición', async () => {
      mockDb.task.findUnique.mockResolvedValue(makeTask(TaskStatus.TODO))

      await expect(
        taskService.updateTask('task-1', 'user-1', { status: TaskStatus.DONE })
      ).rejects.toThrow('Transición de estado inválida: TODO → DONE')
    })

    it('DONE → TODO ✗ (no se puede reabrir una tarea cerrada)', async () => {
      mockDb.task.findUnique.mockResolvedValue(makeTask(TaskStatus.DONE))

      await expect(
        taskService.updateTask('task-1', 'user-1', { status: TaskStatus.TODO })
      ).rejects.toThrow(UnprocessableError)
    })

    it('DONE → IN_PROGRESS ✗', async () => {
      mockDb.task.findUnique.mockResolvedValue(makeTask(TaskStatus.DONE))

      await expect(
        taskService.updateTask('task-1', 'user-1', { status: TaskStatus.IN_PROGRESS })
      ).rejects.toThrow(UnprocessableError)
    })

    it('IN_PROGRESS → TODO ✗ (retroceso)', async () => {
      mockDb.task.findUnique.mockResolvedValue(makeTask(TaskStatus.IN_PROGRESS))

      await expect(
        taskService.updateTask('task-1', 'user-1', { status: TaskStatus.TODO })
      ).rejects.toThrow('Transición de estado inválida: IN_PROGRESS → TODO')
    })

    it('TODO → TODO ✗ (mismo estado)', async () => {
      mockDb.task.findUnique.mockResolvedValue(makeTask(TaskStatus.TODO))

      await expect(
        taskService.updateTask('task-1', 'user-1', { status: TaskStatus.TODO })
      ).rejects.toThrow('Transición de estado inválida: TODO → TODO')
    })
  })

  describe('Registro de historial', () => {
    it('registra la transición en statusHistory', async () => {
      mockDb.task.findUnique.mockResolvedValue(makeTask(TaskStatus.TODO))

      await taskService.updateTask('task-1', 'user-1', { status: TaskStatus.IN_PROGRESS })

      expect(mockDb.statusHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          taskId: 'task-1',
          from: TaskStatus.TODO,
          to: TaskStatus.IN_PROGRESS,
          changedBy: 'user-1',
        }),
      })
    })

    it('no registra historial si el estado no cambia', async () => {
      mockDb.task.findUnique.mockResolvedValue(makeTask(TaskStatus.TODO))

      await taskService.updateTask('task-1', 'user-1', { title: 'Nuevo título' })

      expect(mockDb.statusHistory.create).not.toHaveBeenCalled()
    })
  })
})

describe('TaskService.validateStatusTransition', () => {
  it('permite TODO → IN_PROGRESS', () => {
    expect(() =>
      taskService.validateStatusTransition(TaskStatus.TODO, TaskStatus.IN_PROGRESS)
    ).not.toThrow()
  })

  it('permite IN_PROGRESS → DONE', () => {
    expect(() =>
      taskService.validateStatusTransition(TaskStatus.IN_PROGRESS, TaskStatus.DONE)
    ).not.toThrow()
  })

  it('rechaza TODO → DONE', () => {
    expect(() =>
      taskService.validateStatusTransition(TaskStatus.TODO, TaskStatus.DONE)
    ).toThrow('Transición de estado inválida: TODO → DONE')
  })

  it('rechaza IN_PROGRESS → TODO', () => {
    expect(() =>
      taskService.validateStatusTransition(TaskStatus.IN_PROGRESS, TaskStatus.TODO)
    ).toThrow('Transición de estado inválida: IN_PROGRESS → TODO')
  })

  it('rechaza DONE → TODO', () => {
    expect(() =>
      taskService.validateStatusTransition(TaskStatus.DONE, TaskStatus.TODO)
    ).toThrow('Transición de estado inválida: DONE → TODO')
  })

  it('rechaza transición al mismo estado', () => {
    expect(() =>
      taskService.validateStatusTransition(TaskStatus.TODO, TaskStatus.TODO)
    ).toThrow('Transición de estado inválida: TODO → TODO')
  })
})

describe('TaskService.validateTitle', () => {
  it('lanza error si el titulo tiene menos de 3 caracteres', () => {
    expect(() => taskService.validateTitle('ab')).toThrow(
      'El título debe tener al menos 3 caracteres'
    )
  })

  it('lanza error si el titulo tiene mas de 100 caracteres', () => {
    expect(() => taskService.validateTitle('a'.repeat(101))).toThrow(
      'El título no puede superar los 100 caracteres'
    )
  })

  it('lanza error si el titulo esta vacio o con espacios', () => {
    expect(() => taskService.validateTitle('   ')).toThrow(
      'El título no puede estar vacío'
    )
  })

  it('acepta titulos validos sin lanzar error', () => {
    expect(() => taskService.validateTitle('Mi tarea')).not.toThrow()
  })

  it('acepta titulo con exactamente 3 caracteres', () => {
    expect(() => taskService.validateTitle('abc')).not.toThrow()
  })

  it('acepta titulo con exactamente 100 caracteres', () => {
    expect(() => taskService.validateTitle('a'.repeat(100))).not.toThrow()
  })
})
