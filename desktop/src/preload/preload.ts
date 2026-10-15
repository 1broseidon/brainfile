import { contextBridge, ipcRenderer } from 'electron';
import { CHANNEL, type AgentEvent, type Api, type BoardSnapshot, type LinkView, type Project, type UpdateStatus } from '../shared/api';

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
  reopenTask: invoke('reopenTask'),
  noteTask: invoke('noteTask'),
  decide: invoke('decide'),
  syncNow: invoke('syncNow'),
  settleBoards: invoke('settleBoards'),
  planFix: invoke('planFix'),
  fixBoard: invoke('fixBoard'),
  undoFix: invoke('undoFix'),
  listAgents: invoke('listAgents'),
  agentRegistry: invoke('agentRegistry'),
  prepareRegistryAgent: invoke('prepareRegistryAgent'),
  listModels: invoke('listModels'),
  listModes: invoke('listModes'),
  getSettings: invoke('getSettings'),
  setSettings: invoke('setSettings'),
  dispatch: invoke('dispatch'),
  ask: invoke('ask'),
  discuss: invoke('discuss'),
  stopRun: invoke('stopRun'),
  leads: invoke('leads'),
  pauseLead: invoke('pauseLead'),
  resumeLead: invoke('resumeLead'),
  stopLead: invoke('stopLead'),
  settleLanded: invoke('settleLanded'),
  live: invoke('live'),
  review: invoke('review'),
  updateStatus: invoke('updateStatus'),
  checkUpdate: invoke('checkUpdate'),
  installUpdate: invoke('installUpdate'),
  cancelUpdate: invoke('cancelUpdate'),
  restartToUpdate: invoke('restartToUpdate'),
  readyToMerge: invoke('readyToMerge'),
  mergeReview: invoke('mergeReview'),
  discardReview: invoke('discardReview'),
  openWorktree: invoke('openWorktree'),
  answerPermission: invoke('answerPermission'),
  listEditors: invoke('listEditors'),
  existingFiles: invoke('existingFiles'),
  openInEditor: invoke('openInEditor'),
  forgeRepo: invoke('forgeRepo'),
  listIssues: invoke('listIssues'),
  githubAuth: invoke('githubAuth'),
  setGitHubToken: invoke('setGitHubToken'),
  linkState: invoke('linkState'),
  setLink: invoke('setLink'),
  linkCode: invoke('linkCode'),
  forgetPhone: invoke('forgetPhone'),
  onLinkChanged: (listener) => subscribe<LinkView>(CHANNEL.link, listener),
  onUpdate: (listener) => subscribe<UpdateStatus>(CHANNEL.update, listener),
  onAgentEvent: (listener) => subscribe<AgentEvent>(CHANNEL.agent, listener),
  onReadyChanged: (listener) => subscribe<string>(CHANNEL.ready, listener),
  onBoardChanged: (listener) => subscribe<BoardSnapshot>(CHANNEL.board, listener),
  onProjectsChanged: (listener) => subscribe<Project[]>(CHANNEL.projects, listener),
} as Api;

contextBridge.exposeInMainWorld('brainfile', api);
