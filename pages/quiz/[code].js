// pages/quiz/[code].js
//
// The public, shareable join link: https://yourdomain.com/quiz/{quiz-code}
// No portal login required — this is the "Anyone with the code can join"
// entry point described in the requirements.

import { useRouter } from 'next/router';
import Head from 'next/head';
import OnlineQuizParticipant from '../../components/OnlineQuizParticipant';

export default function QuizJoinPage() {
  const router = useRouter();
  const { code } = router.query;

  if (!code) return null; // router not ready yet on first render

  return (
    <>
      <Head>
        <title>Join Quiz {code}</title>
      </Head>
      <OnlineQuizParticipant quizCode={String(code).toUpperCase()} />
    </>
  );
}
