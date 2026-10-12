import { contextBridge, ipcRenderer } from 'electron';
import { CHANNEL, type AgentEvent, type Api, type BoardSnapshot, type Project } from '../shared/api';

const invoke =
  (method: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(CHANNEL.invoke, method, ...args);

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: unknown, value: T) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: Api = {
  listProjects: invoke('listProjects'),
  addProject: invoke('addProject'),
  removeProject: invoke('removeProject'),
  revealProject: invoke('revealProject'),
  refreshProject: invoke('refreshProject'),
  initBoard: invoke('initBoard'),
  openBoard: invoke('openBoard'),
  closeBoard: invoke('closeBoard'),
  getTask: invoke('getTask'),
  addTask: invoke('addTask'),
  moveTask: invoke('moveTask'),
  patchTask: invoke('patchTask'),
  toggleSubtask: invoke('toggleSubtask'),
  addSubtask: invoke('addSubtask'),
  completeTask: invoke('completeTask'),
  deleteTask: invoke('deleteTask'),
  restoreTask: invoke('restoreTask'),
  syncNow: invoke('syncNow'),
  listAgents: invoke('listAgents'),
  dispatch: invoke('dispatch'),
  ask: invoke('ask'),
  stopRun: invoke('stopRun'),
  answerPermission: invoke('answerPermission'),
  onAgentEvent: (listener) => subscribe<AgentEvent>(CHANNEL.agent, listener),
  onBoardChanged: (listener) => subscribe<BoardSnapshot>(CHANNEL.board, listener),
  onProjectsChanged: (listener) => subscribe<Project[]>(CHANNEL.projects, listener),
} as Api;

contextBridge.exposeInMainWorld('brainfile', api);
