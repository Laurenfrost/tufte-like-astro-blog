declare module 'virtual:astro-tufte/config' {
  export interface NavItem {
    href: string;
    label: string;
  }

  export interface LinkItem {
    name: string;
    url: string;
    description?: string;
  }

  export interface TufteSite {
    title: string;
    tagline: string;
    description: string;
    lang: string;
    locale: string;
    favicon: string;
    nav: NavItem[];
    footer: { credit: boolean; copyright: string };
    home: { intro: string[] };
    links: LinkItem[];
    text: {
      recentPosts: string;
      archiveTitle: string;
      archiveCount: string;
      linksTitle: string;
      linksIntro: string;
    };
    katexCss: string;
  }

  export const site: TufteSite;
  export default site;
}
