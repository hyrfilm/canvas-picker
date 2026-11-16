// An ID-addressed state experiment. Queries are the renderer's only connection
// to these maps; pointer input and the clock both arrive as commands.
type StepAction = 'toggle' | 'select' | 'mark' | 'toggleProbability'
type StepEvent =
  | { type: StepAction; id: string }
  | { type: 'hover' | 'playhead'; id: string; active: boolean }

type Values = { enabled: boolean; selected: boolean; probability: number; marked: boolean }

function createStepState() {
  const values = new Map<string, Values>()
  const visual = new Map<string, { hovered: boolean; playing: boolean }>()

  function register(id: string, initial: Partial<Values> = {}) {
    values.set(id, { enabled: false, selected: false, probability: 1, marked: false, ...initial })
    visual.set(id, { hovered: false, playing: false })
  }

  function send(event: StepEvent) {
    const data = values.get(event.id)!
    switch (event.type) {
      case 'toggle': data.enabled = !data.enabled; break
      case 'select': data.selected = !data.selected; break
      case 'mark': data.marked = !data.marked; break
      case 'toggleProbability': data.probability = data.probability === 1 ? .5 : 1; break
      case 'hover': visual.get(event.id)!.hovered = event.active; break
      case 'playhead': visual.get(event.id)!.playing = event.active; break
    }
  }

  const queries = {
    isEnabled: (id: string) => values.get(id)!.enabled,
    isSelected: (id: string) => values.get(id)!.selected,
    isMarked: (id: string) => values.get(id)!.marked,
    getProbability: (id: string) => values.get(id)!.probability,
    isHovered: (id: string) => visual.get(id)!.hovered,
    isPlaying: (id: string) => visual.get(id)!.playing,
  }

  return { register, send, queries }
}

export { createStepState }
export type { StepEvent, StepAction }
