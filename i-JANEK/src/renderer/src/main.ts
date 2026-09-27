import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { installRuntimeBridge } from './services/runtime'
import './styles/index.css'

installRuntimeBridge()

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
