import Navigation from "@/components/Navigation";
import AuthForm from "@/components/AuthForm";

export default function Home() {
  return (
    <div className="font-sans min-h-screen w-full max-w-screen">
      <Navigation />
      <main className="container mx-auto px-4 py-8 flex flex-col max-w-[1000px]">
        <h1 className='lg:text-4xl text-2xl text-center font-bold tracking-tight'>
          A Fantasy Football Game for Failures by Failures!
        </h1>

        <div className="flex items-center justify-center py-8">
          <AuthForm />
        </div>

        <div className='flex flex-col py-8 gap-2'>
          <h2 className='lg:text-2xl text-xl font-bold tracking-tight mb-4'>How do you play Fantasy Failball?</h2>
          <p className='lg:text-lg'>
            For people who have played season-long fantasy football before, Failball is very similar.
            You draft a team, set a line-up each week, and compete against other members of your league for glory, fun, money, the desperate hope that your college friends will stay in touch... you name it.
            <br></br>
            <br></br>
            The only difference is that in Failball, everything is different! Down is up! Black is white! Cats are dogs!
            More specifically, <span className='font-semibold tracking-tight'>in Fantasy Failball you get more points the worse your players perform</span>.
            Fumbles, interceptions, sacks, receivers that drop the ball, running backs that go backwards, that's what you're looking for in Failball.
            <br></br>
            <br></br>
            Peak Jameis Winston throwing his fifth interception? Yes, please.
            <br></br>
            Dameon Pierce running 20 times for 15 yards and a fumble? Chef's kiss.
            <br></br>
            Jerry Jeudy drops two balls in the same game? Failball gold.
            <br></br>
            <br></br>
            We aren't here to root for failure, but rather to celebrate it's inevitability.
            It's a part of life, and like it or not it is sometimes a part of what our favorite teams do on any given sunday.
            So join us in accepting the ridiculous, chaotic joy of failure that is Fantasy Failball!
            <br></br>
            <br></br>
            For a full breakdown of the scoring system, check out our <a href='/rules'>rules page</a>.
          </p>
        </div>
      </main>
    </div>
  );
}
