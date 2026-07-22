import '@fontsource/pretendard/400.css'
import '@fontsource/pretendard/500.css'
import '@fontsource/pretendard/600.css'
import '@fontsource/pretendard/700.css'
import '@fontsource/pretendard/800.css'
import Reveal from 'reveal.js'
import RevealNotes from 'reveal.js/plugin/notes'
import 'reveal.js/reveal.css'
import { validateLayoutContract } from './layout-contract'
import './theme.css'

validateLayoutContract(document)

const revealElement = document.querySelector<HTMLElement>('.reveal')
if (!revealElement) {
  throw new Error('Reveal.js 루트 요소가 없습니다.')
}

const deck = new Reveal(revealElement, {
  width: 1600,
  height: 900,
  margin: 0,
  minScale: 0.2,
  maxScale: 2,
  hash: true,
  controls: true,
  progress: true,
  center: false,
  slideNumber: 'c/t',
  transition: 'fade',
  transitionSpeed: 'fast',
  backgroundTransition: 'fade',
  plugins: [RevealNotes],
})

await deck.initialize()
Reflect.set(window, 'researchDeck', deck)
