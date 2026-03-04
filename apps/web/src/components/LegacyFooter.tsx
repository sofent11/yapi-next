import {
  GithubOutlined,
  TeamOutlined,
  MessageOutlined,
  FileTextOutlined
} from '@ant-design/icons';

const year = new Date().getFullYear();

const footerSections = [
  {
    title: 'GitHub',
    icon: <GithubOutlined />,
    links: [{ label: 'YApi 源码仓库', href: 'https://github.com/YMFE/yapi' }]
  },
  {
    title: '团队',
    icon: <TeamOutlined />,
    links: [{ label: 'YMFE', href: 'https://ymfe.org' }]
  },
  {
    title: '反馈',
    icon: <MessageOutlined />,
    links: [
      { label: 'Github Issues', href: 'https://github.com/YMFE/yapi/issues' },
      { label: 'Github Pull Requests', href: 'https://github.com/YMFE/yapi/pulls' }
    ]
  },
  {
    title: `Copyright © 2018-${year} YMFE`,
    icon: <FileTextOutlined />,
    links: [
      { label: '版本说明', href: 'https://github.com/YMFE/yapi/blob/master/CHANGELOG.md' },
      { label: '使用文档', href: 'https://hellosean1025.github.io/yapi/' }
    ]
  }
];

export function LegacyFooter() {
  return (
    <footer className="legacy-footer">
      <div className="legacy-footer-content">
        {footerSections.map(section => (
          <div key={section.title} className="legacy-footer-col">
            <div className="legacy-footer-title">
              {section.icon}
              <span>{section.title}</span>
            </div>
            {section.links.map(link => (
              <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
                {link.label}
              </a>
            ))}
          </div>
        ))}
      </div>
    </footer>
  );
}
