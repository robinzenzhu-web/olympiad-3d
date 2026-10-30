import type { ObjectState } from '../engine/state'
import { CellGroup } from './CellGroup'

/** CubeStack：积木全部米白（不涂色），靠描边、highlight、fade、number 来讲解 */
export function CubeStack({ obj }: { obj: ObjectState }) {
  return <CellGroup obj={obj} painted={false} />
}
