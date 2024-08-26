import styles from './Dashboard.module.css';
import { activeUserAtom } from '../../state/Atoms';
import { useAtom } from 'jotai';
import axios from 'axios';
import { useEffect } from 'react';
import ClickDataVisualization from '../d3Charts/AllUserData';

function Dashboard() {
    //retrieve user data
// useEffect(()=> {
// axios.get('/api/user')
// .then(res => {
//     console.log(res)
// })
// }, [])

  const [user] = useAtom(activeUserAtom);
  return (
    <div className={styles.dashboard}>
      <h1>{`Welcome back, ${user}`}</h1>
      <ClickDataVisualization />
    </div>
  );
}

export default Dashboard;
