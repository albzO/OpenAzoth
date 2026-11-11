import { render } from 'preact';
import { App } from './ui/App';
import { initConnection } from './state/connection';
import './styles.css';

initConnection();
render(<App />, document.getElementById('app')!);
