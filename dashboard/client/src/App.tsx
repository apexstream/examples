import { DashboardLiveView } from "./DashboardLiveView";
import { useLiveMetricsDashboard } from "./useLiveMetricsDashboard";

export default function App() {
  const dash = useLiveMetricsDashboard();
  return <DashboardLiveView {...dash} />;
}
