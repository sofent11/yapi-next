import {
  GithubOutlined,
  TeamOutlined,
  MessageOutlined,
  FileTextOutlined
} from '@ant-design/icons';

const year = new Date().getFullYear();

export function LegacyFooter() {
  const currentYear = new Date().getFullYear();
  const yearText = currentYear > 2026 ? `2018-${currentYear}` : '2018-2026';

  return (
    <footer className="legacy-footer">
      <div className="legacy-footer-content" style={{ justifyContent: 'center' }}>
        <div className="legacy-footer-col" style={{ alignItems: 'center' }}>
          <div className="legacy-footer-title">
            <span>Copyright © {yearText} YMFE</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
