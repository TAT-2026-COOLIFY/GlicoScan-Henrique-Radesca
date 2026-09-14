import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { lembretes } from './lembretes'

function criarLocalStorageFalso() {
  let dados = {}
  return {
    getItem: (k) => (k in dados ? dados[k] : null),
    setItem: (k, v) => { dados[k] = String(v) },
    removeItem: (k) => { delete dados[k] },
    clear: () => { dados = {} },
  }
}

function criarNotificationFalsa(permissao = 'granted') {
  const instancias = []
  function NotificationFalsa(titulo, opcoes) {
    instancias.push({ titulo, opcoes })
  }
  NotificationFalsa.permission = permissao
  NotificationFalsa.requestPermission = vi.fn(async () => permissao)
  NotificationFalsa._instancias = instancias
  return NotificationFalsa
}

beforeEach(() => {
  globalThis.localStorage = criarLocalStorageFalso()
})

afterEach(() => {
  vi.useRealTimers()
  delete globalThis.Notification
})

describe('lembretes — horários configurados', () => {
  it('começa vazio', () => {
    expect(lembretes.listar()).toEqual([])
  })

  it('adicionar guarda e ordena os horários', () => {
    lembretes.adicionar('14:00')
    lembretes.adicionar('08:00')
    expect(lembretes.listar()).toEqual(['08:00', '14:00'])
  })

  it('rejeita horário em formato inválido', () => {
    lembretes.adicionar('meio-dia')
    expect(lembretes.listar()).toEqual([])
  })

  it('não duplica o mesmo horário', () => {
    lembretes.adicionar('08:00')
    lembretes.adicionar('08:00')
    expect(lembretes.listar()).toEqual(['08:00'])
  })

  it('remover tira da lista', () => {
    lembretes.adicionar('08:00')
    lembretes.remover('08:00')
    expect(lembretes.listar()).toEqual([])
  })
})

describe('lembretes — permissão de notificação', () => {
  it('permissaoConcedida reflete Notification.permission', () => {
    globalThis.Notification = criarNotificationFalsa('granted')
    expect(lembretes.permissaoConcedida()).toBe(true)
  })

  it('pedirPermissao não pede de novo se já concedida', async () => {
    globalThis.Notification = criarNotificationFalsa('granted')
    const ok = await lembretes.pedirPermissao()
    expect(ok).toBe(true)
    expect(globalThis.Notification.requestPermission).not.toHaveBeenCalled()
  })

  it('pedirPermissao pede quando ainda não decidido', async () => {
    globalThis.Notification = criarNotificationFalsa('default')
    globalThis.Notification.requestPermission = vi.fn(async () => 'granted')
    const ok = await lembretes.pedirPermissao()
    expect(ok).toBe(true)
    expect(globalThis.Notification.requestPermission).toHaveBeenCalled()
  })
})

describe('lembretes — disparo', () => {
  it('dispara notificação no horário configurado', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 15, 8, 0))
    globalThis.Notification = criarNotificationFalsa('granted')

    lembretes.adicionar('08:00')
    lembretes.verificarEDisparar()

    expect(globalThis.Notification._instancias).toHaveLength(1)
    expect(globalThis.Notification._instancias[0].titulo).toBe('GlicoScan')
  })

  it('não dispara fora do horário configurado', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 15, 9, 0))
    globalThis.Notification = criarNotificationFalsa('granted')

    lembretes.adicionar('08:00')
    lembretes.verificarEDisparar()

    expect(globalThis.Notification._instancias).toHaveLength(0)
  })

  it('não dispara duas vezes no mesmo dia pro mesmo horário', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 15, 8, 0))
    globalThis.Notification = criarNotificationFalsa('granted')

    lembretes.adicionar('08:00')
    lembretes.verificarEDisparar()
    lembretes.verificarEDisparar()

    expect(globalThis.Notification._instancias).toHaveLength(1)
  })

  it('não dispara sem permissão concedida', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 15, 8, 0))
    globalThis.Notification = criarNotificationFalsa('default')

    lembretes.adicionar('08:00')
    lembretes.verificarEDisparar()

    expect(globalThis.Notification._instancias).toHaveLength(0)
  })
})
